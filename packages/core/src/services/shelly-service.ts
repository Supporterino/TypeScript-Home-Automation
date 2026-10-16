import type {
  ShellyComponentKind,
  ShellyComponentStatus,
  ShellyComponentsStatus,
  ShellyCoverConfig,
  ShellyCoverState,
  ShellyCoverStatus,
  ShellyDeviceInfo,
  ShellyDeviceType,
  ShellyDiscoveredComponent,
  ShellyMqttRpcResponse,
  ShellySwitchConfig,
  ShellySwitchSetResult,
  ShellySwitchStatus,
  ShellySysStatus,
} from "@ts-ha/shared/types/shelly";
import type { Logger } from "pino";
import type { HttpClient } from "../http/http-client.js";
import type { MqttService } from "../mqtt/mqtt-service.js";

/** Default `src` identifier used for Shelly MQTT RPC requests. */
const DEFAULT_MQTT_RPC_SRC = "ts-home-automation";

/** Fixed timeout for a single Shelly MQTT RPC request, in milliseconds. */
const MQTT_RPC_TIMEOUT_MS = 5000;

/**
 * Timeout for one HTTP `Shelly.GetComponents` page, in milliseconds. Discovery
 * happens at startup and is awaited, so a single unreachable device must not
 * stall engine startup on the general-purpose 30s HTTP default.
 */
const COMPONENT_DISCOVERY_TIMEOUT_MS = 5000;

/**
 * A registered Shelly device's transport, HTTP identity, or MQTT identity, and
 * HomeKit type.
 */
export interface ShellyDevice {
  /** Friendly name for logging and lookup (e.g. "living_room_plug"). */
  name: string;
  /** IP address or hostname of the Shelly device. Present when `transport === "http"`. */
  host?: string;
  /**
   * The HomeKit-facing device type, used by the HomeKit bridge to decide which
   * HAP service to expose. Defaults to `"switch"` when not specified at
   * registration.
   */
  type: ShellyDeviceType;
  /**
   * The transport used to communicate with this device, fixed at registration
   * time. There is no automatic fallback between transports.
   */
  transport: "http" | "mqtt";
  /**
   * The device's Shelly Gen2 MQTT topic prefix (e.g.
   * "shellyplus1-a8032abe54dc"). Present when `transport === "mqtt"`.
   */
  topicPrefix?: string;
  /**
   * The component channel this record addresses. Present on channel-scoped
   * records materialized by the device source; absent on — and therefore `0`
   * for — a plain registration, preserving single-component behavior.
   */
  channel?: number;
}

/** Options accepted by the object-form `register()` overload for MQTT devices. */
export interface ShellyMqttRegisterOptions {
  type?: ShellyDeviceType;
  transport: "mqtt";
  topicPrefix: string;
}

/** Callback fired when a Shelly device is registered. */
export type ShellyDeviceRegisteredHandler = (device: ShellyDevice) => void;

/**
 * Dependency context passed to a `ShellyServiceFactory`: the shared `HttpClient` and
 * `MqttService` plus a scoped `Logger`.
 */
export interface ShellyServiceContext {
  http: HttpClient;
  mqtt: MqttService;
  logger: Logger;
}

/**
 * Factory function type specifically for `ShellyService`: receives a single
 * {@link ShellyServiceContext} object rather than positional arguments.
 */
export type ShellyServiceFactory = (ctx: ShellyServiceContext) => ShellyService;

/** A pending MQTT RPC request awaiting a correlated response. */
interface PendingMqttRpc {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  device: string;
  topicPrefix: string;
  method: string;
}

/**
 * Parse one raw `Shelly.GetComponents` entry into a typed component status, or `null` for
 * an unrecognized kind or malformed entry.
 */
function parseShellyComponent(raw: unknown): ShellyComponentStatus | null {
  if (raw === null || typeof raw !== "object") return null;

  const key = (raw as { key?: unknown }).key;
  if (typeof key !== "string") return null;
  const match = /^(switch|cover):(\d+)$/.exec(key);
  if (!match) return null;
  const kind = match[1] as ShellyComponentKind;
  const channel = Number.parseInt(match[2], 10);

  const config = (raw as { config?: unknown }).config;
  const rawName =
    config !== null && typeof config === "object" ? (config as { name?: unknown }).name : undefined;
  const name = typeof rawName === "string" && rawName.length > 0 ? rawName : null;

  const rawStatus = (raw as { status?: unknown }).status;
  const status =
    rawStatus !== null && typeof rawStatus === "object" && !Array.isArray(rawStatus)
      ? (rawStatus as Record<string, unknown>)
      : undefined;

  return status ? { key, kind, channel, name, status } : { key, kind, channel, name };
}

/**
 * Parse a raw `Shelly.GetComponents` response into the shared {@link ShellyComponentsStatus}
 * shape, or `null` when unsupported.
 */
function parseGetComponentsPage(response: unknown, offset: number): ShellyComponentsStatus | null {
  if (response === null || typeof response !== "object") return null;
  const rawComponents = (response as { components?: unknown }).components;
  if (!Array.isArray(rawComponents)) return null;

  const components: ShellyComponentStatus[] = [];
  for (const raw of rawComponents) {
    const component = parseShellyComponent(raw);
    if (component) components.push(component);
  }

  const rawTotal = (response as { total?: unknown }).total;
  const total = typeof rawTotal === "number" && Number.isFinite(rawTotal) ? rawTotal : 0;

  return { components, total, offset, returned: rawComponents.length };
}

/** Whether a component's status reported a finite cumulative energy reading. */
function componentIsMetered(status: Record<string, unknown> | undefined): boolean {
  const aenergy = status?.aenergy;
  if (aenergy === null || typeof aenergy !== "object") return false;
  const total = (aenergy as { total?: unknown }).total;
  return typeof total === "number" && Number.isFinite(total);
}

/**
 * Service for interacting with Shelly Gen 2 devices over their HTTP RPC API or their
 * native RPC-over-MQTT channel; devices are registered by name with a fixed transport and
 * controlled via convenience methods that route to the correct transport.
 */
export class ShellyService {
  private readonly devices: Map<string, ShellyDevice> = new Map();

  /**
   * Channel-scoped records materialized by the device source after component
   * discovery, kept separate from `devices` so `getDevices()` stays registration-only.
   */
  private readonly channelDevices: Map<string, ShellyDevice> = new Map();

  /** Reverse index from a channel record's logical name to the registration it was materialized from. */
  private readonly channelBaseNames: Map<string, string> = new Map();

  /**
   * Handlers fired when a device is registered. Uses a plain `Set` (mirroring
   * `DeviceRegistry`) rather than Node's `EventEmitter`.
   */
  private readonly deviceRegisteredHandlers: Set<ShellyDeviceRegisteredHandler> = new Set();

  /** Monotonically increasing MQTT RPC request id, scoped to this instance. */
  private mqttRpcId = 0;

  /** Pending MQTT RPC requests awaiting a correlated response, keyed by id. */
  private readonly pendingMqttRpc: Map<number, PendingMqttRpc> = new Map();

  /** Whether the shared `<src>/rpc` response subscription has been set up. */
  private mqttRpcSubscribed = false;

  constructor(
    private readonly http: HttpClient,
    private readonly mqtt: MqttService,
    private readonly logger: Logger,
    private readonly mqttRpcSrc: string = DEFAULT_MQTT_RPC_SRC,
  ) {}

  /**
   * Register an HTTP-transport Shelly device by name; the host may be an IP, hostname, or
   * URL (scheme stripped), and `type` defaults to `"switch"`.
   */
  register(name: string, host: string): void;
  register(name: string, host: string, type: ShellyDeviceType): void;
  /**
   * Register an MQTT-transport Shelly device by name; the device's `MQTT.SetConfig` must
   * be set on-device out-of-band.
   */
  register(name: string, options: ShellyMqttRegisterOptions): void;
  register(
    name: string,
    hostOrOptions: string | ShellyMqttRegisterOptions,
    type: ShellyDeviceType = "switch",
  ): void {
    let device: ShellyDevice;
    if (typeof hostOrOptions === "string") {
      const normalized = this.normalizeHost(hostOrOptions);
      device = { name, host: normalized, type, transport: "http" };
    } else {
      device = {
        name,
        type: hostOrOptions.type ?? "switch",
        transport: "mqtt",
        topicPrefix: hostOrOptions.topicPrefix,
      };
    }

    this.devices.set(name, device);
    this.logger.info(
      {
        name,
        transport: device.transport,
        host: device.host,
        topicPrefix: device.topicPrefix,
        type: device.type,
      },
      "Shelly device registered",
    );

    // Notify registration listeners, isolating each so one failure does not stop the others.
    for (const cb of this.deviceRegisteredHandlers) {
      try {
        cb(device);
      } catch (err) {
        this.logger.error({ err, name }, "Error in onDeviceRegistered handler");
      }
    }
  }

  /**
   * Register multiple Shelly devices at once, as an array of HTTP/MQTT entries or a
   * `Record<name, host>` shorthand.
   */
  registerMany(
    devices:
      | Array<
          | { name: string; host: string; type?: ShellyDeviceType }
          | { name: string; type?: ShellyDeviceType; transport: "mqtt"; topicPrefix: string }
        >
      | Record<string, string>,
  ): void {
    if (Array.isArray(devices)) {
      for (const device of devices) {
        if ("transport" in device && device.transport === "mqtt") {
          this.register(device.name, {
            type: device.type,
            transport: "mqtt",
            topicPrefix: device.topicPrefix,
          });
        } else if ("host" in device) {
          this.register(device.name, device.host, device.type ?? "switch");
        }
      }
    } else {
      for (const [name, host] of Object.entries(devices)) {
        this.register(name, host);
      }
    }
  }

  /**
   * @internal
   *
   * Materialize a channel-scoped record for a component discovered on an already-registered
   * device, without firing `onDeviceRegistered` listeners.
   */
  registerChannel(
    baseName: string,
    channel: number,
    options: { name: string; type: ShellyDeviceType },
  ): void {
    const base = this.devices.get(baseName);
    if (!base) {
      throw new Error(
        `Cannot materialize a channel record for unregistered Shelly device "${baseName}".`,
      );
    }

    const record: ShellyDevice = {
      ...base,
      name: options.name,
      type: options.type,
      channel,
    };
    this.channelDevices.set(options.name, record);
    this.channelBaseNames.set(options.name, baseName);
    this.logger.debug(
      { base: baseName, name: options.name, channel, type: options.type },
      "Shelly channel record materialized",
    );
  }

  /**
   * @internal
   *
   * Remove channel records for `baseName` whose logical name is not in `keepNames`, so a
   * component rename does not leave the old id commandable.
   */
  pruneChannels(baseName: string, keepNames: ReadonlySet<string>): void {
    for (const [name, recordBase] of this.channelBaseNames) {
      if (recordBase !== baseName) continue;
      if (keepNames.has(name)) continue;
      this.channelDevices.delete(name);
      this.channelBaseNames.delete(name);
      this.logger.debug({ base: baseName, name }, "Shelly channel record pruned");
    }
  }

  /**
   * @internal
   *
   * Drop every channel record materialized by the device source, so a stop/start cannot
   * resolve a command through a stale record.
   */
  clearChannelRecords(): void {
    this.channelDevices.clear();
    this.channelBaseNames.clear();
  }

  /** Return a read-only snapshot of all registered devices. */
  getDevices(): ShellyDevice[] {
    return Array.from(this.devices.values());
  }

  /** Subscribe to device registrations; the handler runs synchronously on each registration. */
  onDeviceRegistered(cb: ShellyDeviceRegisteredHandler): void {
    this.deviceRegisteredHandlers.add(cb);
  }

  /** Remove a previously-registered registration handler. */
  offDeviceRegistered(cb: ShellyDeviceRegisteredHandler): void {
    this.deviceRegisteredHandlers.delete(cb);
  }

  // -------------------------------------------------------------------------
  // Switch control
  // -------------------------------------------------------------------------

  /** Turn a Shelly switch on, optionally toggling back after `toggleAfter` seconds. */
  async turnOn(name: string, toggleAfter?: number): Promise<ShellySwitchSetResult> {
    const params: Record<string, unknown> = { id: this.channelOf(name), on: true };
    if (toggleAfter !== undefined) {
      params.toggle_after = toggleAfter;
    }
    this.logger.info({ device: name }, "Turning Shelly switch ON");
    return this.rpc<ShellySwitchSetResult>(name, "Switch.Set", params);
  }

  /** Turn a Shelly switch off, optionally toggling back after `toggleAfter` seconds. */
  async turnOff(name: string, toggleAfter?: number): Promise<ShellySwitchSetResult> {
    const params: Record<string, unknown> = { id: this.channelOf(name), on: false };
    if (toggleAfter !== undefined) {
      params.toggle_after = toggleAfter;
    }
    this.logger.info({ device: name }, "Turning Shelly switch OFF");
    return this.rpc<ShellySwitchSetResult>(name, "Switch.Set", params);
  }

  /** Toggle a Shelly switch. */
  async toggle(name: string): Promise<ShellySwitchSetResult> {
    this.logger.info({ device: name }, "Toggling Shelly switch");
    return this.rpc<ShellySwitchSetResult>(name, "Switch.Toggle", { id: this.channelOf(name) });
  }

  // -------------------------------------------------------------------------
  // Cover/shutter control (Shelly Plus 2PM in roller mode)
  // -------------------------------------------------------------------------

  /** Open a Shelly cover, optionally stopping after `duration` seconds. */
  async coverOpen(name: string, duration?: number): Promise<void> {
    const params: Record<string, unknown> = { id: this.channelOf(name) };
    if (duration !== undefined) {
      params.duration = duration;
    }
    this.logger.info({ device: name }, "Opening Shelly cover");
    await this.rpc(name, "Cover.Open", params);
  }

  /** Close a Shelly cover, optionally stopping after `duration` seconds. */
  async coverClose(name: string, duration?: number): Promise<void> {
    const params: Record<string, unknown> = { id: this.channelOf(name) };
    if (duration !== undefined) {
      params.duration = duration;
    }
    this.logger.info({ device: name }, "Closing Shelly cover");
    await this.rpc(name, "Cover.Close", params);
  }

  /** Stop a Shelly cover. */
  async coverStop(name: string): Promise<void> {
    this.logger.info({ device: name }, "Stopping Shelly cover");
    await this.rpc(name, "Cover.Stop", { id: this.channelOf(name) });
  }

  /** Move a Shelly cover to an absolute position 0–100; requires calibration. */
  async coverGoToPosition(name: string, position: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.round(position)));
    if (clamped !== position) {
      this.logger.warn(
        { device: name, requested: position, clamped },
        "Cover position clamped to 0-100 range",
      );
    }
    this.logger.info({ device: name, position: clamped }, "Moving Shelly cover to position");
    await this.rpc(name, "Cover.GoToPosition", { id: this.channelOf(name), pos: clamped });
  }

  /** Move a Shelly cover by a relative offset -100..100; requires calibration. */
  async coverMoveRelative(name: string, offset: number): Promise<void> {
    const clamped = Math.max(-100, Math.min(100, Math.round(offset)));
    if (clamped !== offset) {
      this.logger.warn(
        { device: name, requested: offset, clamped },
        "Cover offset clamped to -100 to 100 range",
      );
    }
    this.logger.info({ device: name, offset: clamped }, "Moving Shelly cover by relative offset");
    await this.rpc(name, "Cover.GoToPosition", { id: this.channelOf(name), rel: clamped });
  }

  /** Get the current status of a Shelly cover (position, state, power). */
  async getCoverStatus(name: string): Promise<ShellyCoverStatus> {
    return this.rpc<ShellyCoverStatus>(name, "Cover.GetStatus", { id: this.channelOf(name) });
  }

  /** Get the configuration of a Shelly cover. */
  async getCoverConfig(name: string): Promise<ShellyCoverConfig> {
    return this.rpc<ShellyCoverConfig>(name, "Cover.GetConfig", { id: this.channelOf(name) });
  }

  /** Start calibration: the cover opens and closes fully to measure travel times. */
  async coverCalibrate(name: string): Promise<void> {
    this.logger.warn({ device: name }, "Starting Shelly cover calibration");
    await this.rpc(name, "Cover.Calibrate", { id: this.channelOf(name) });
  }

  /** Get the current position of a Shelly cover (0–100, or null if uncalibrated). */
  async getCoverPosition(name: string): Promise<number | null> {
    const status = await this.getCoverStatus(name);
    return status.current_pos;
  }

  /** Get the current state of a Shelly cover. */
  async getCoverState(name: string): Promise<ShellyCoverState> {
    const status = await this.getCoverStatus(name);
    return status.state;
  }

  // -------------------------------------------------------------------------
  // Status and info (shared across Switch and Cover devices)
  // -------------------------------------------------------------------------

  /** Get the current status of a Shelly switch, including power metering. */
  async getStatus(name: string): Promise<ShellySwitchStatus> {
    return this.rpc<ShellySwitchStatus>(name, "Switch.GetStatus", { id: this.channelOf(name) });
  }

  /** Get the configuration of a Shelly switch. */
  async getConfig(name: string): Promise<ShellySwitchConfig> {
    return this.rpc<ShellySwitchConfig>(name, "Switch.GetConfig", { id: this.channelOf(name) });
  }

  /** Get device identification info. */
  async getDeviceInfo(name: string): Promise<ShellyDeviceInfo> {
    return this.rpc<ShellyDeviceInfo>(name, "Shelly.GetDeviceInfo");
  }

  /** Get system-level status (uptime, RAM, firmware updates). */
  async getSysStatus(name: string): Promise<ShellySysStatus> {
    return this.rpc<ShellySysStatus>(name, "Sys.GetStatus");
  }

  /** Check whether the switch is currently on. */
  async isOn(name: string): Promise<boolean> {
    const status = await this.getStatus(name);
    return status.output;
  }

  /** Get the current power consumption in Watts. */
  async getPower(name: string): Promise<number> {
    const status = await this.getStatus(name);
    return status.apower;
  }

  /** Reboot a Shelly device, optionally after `delayMs` milliseconds. */
  async reboot(name: string, delayMs?: number): Promise<void> {
    const params = delayMs !== undefined ? { delay_ms: delayMs } : undefined;
    this.logger.warn({ device: name }, "Rebooting Shelly device");
    await this.rpc(name, "Shelly.Reboot", params);
  }

  // -------------------------------------------------------------------------
  // Component discovery
  // -------------------------------------------------------------------------

  /**
   * Enumerate the `switch:N`/`cover:N` components a device exposes via
   * `Shelly.GetComponents`, paging the whole inventory. A page that fails or is
   * unsupported discards the entire result, returning `[]`.
   */
  async discoverComponents(name: string): Promise<ShellyDiscoveredComponent[]> {
    const discovered: ShellyDiscoveredComponent[] = [];
    const seen = new Set<string>();
    let offset = 0;

    while (true) {
      let response: unknown;
      try {
        response = await this.rpc<unknown>(
          name,
          "Shelly.GetComponents",
          {
            include: ["status", "config"],
            offset,
          },
          COMPONENT_DISCOVERY_TIMEOUT_MS,
        );
      } catch (err) {
        this.logger.warn(
          { err, device: name, offset },
          "Shelly component discovery failed — falling back to a single channel-0 component",
        );
        return [];
      }

      const page = parseGetComponentsPage(response, offset);
      if (!page) {
        this.logger.warn(
          { device: name, offset },
          "Shelly component discovery returned an unsupported response — falling back to a single channel-0 component",
        );
        return [];
      }

      for (const component of page.components) {
        const key = `${component.kind}:${component.channel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        discovered.push({
          channel: component.channel,
          kind: component.kind,
          name: component.name,
          metered: componentIsMetered(component.status),
        });
      }

      // Page on the raw component count: a page can carry unsupported kinds that sort
      // ahead of switch/cover, so advancing by the recognized count would skip inventory.
      const returned = page.returned ?? page.components.length;
      // Stop on the last page or an empty page (which would otherwise let
      // `offset` stall and loop forever).
      if (returned === 0) break;
      if (offset + returned >= page.total) break;
      offset += returned;
    }

    return discovered;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Normalize a host string by stripping scheme and trailing slashes.
   */
  private normalizeHost(host: string): string {
    let normalized = host.trim();
    // Strip scheme (http:// or https://)
    normalized = normalized.replace(/^https?:\/\//, "");
    // Strip trailing slashes
    normalized = normalized.replace(/\/+$/, "");
    return normalized;
  }

  /**
   * Look up a device by name across public registrations and the internal channel map,
   * with channel records taking precedence; throws if unknown.
   */
  private getDevice(name: string): ShellyDevice {
    const device = this.channelDevices.get(name) ?? this.devices.get(name);
    if (!device) {
      throw new Error(
        `Shelly device "${name}" is not registered. Call shelly.register("${name}", "<ip>") first.`,
      );
    }
    return device;
  }

  /**
   * The component channel a device's commands target. A plain registration
   * carries no channel and defaults to `0`.
   */
  private channelOf(name: string): number {
    return this.getDevice(name).channel ?? 0;
  }

  /**
   * Dispatch an RPC call to a Shelly device, routing to HTTP or MQTT by its transport,
   * with no automatic fallback.
   */
  private async rpc<T>(
    name: string,
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    const device = this.getDevice(name);
    return device.transport === "mqtt"
      ? this.mqttRpc<T>(device, method, params)
      : this.httpRpc<T>(device, method, params, timeoutMs);
  }

  /**
   * Execute an RPC call to a Shelly device via HTTP GET.
   */
  private async httpRpc<T>(
    device: ShellyDevice,
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    const name = device.name;
    const searchParams = params
      ? new URLSearchParams(
          Object.entries(params).map(([key, value]) => [
            key,
            value !== null && typeof value === "object" ? JSON.stringify(value) : String(value),
          ]),
        )
      : undefined;
    const query = searchParams ? `?${searchParams.toString()}` : "";
    const url = `http://${device.host}/rpc/${method}${query}`;

    const response =
      timeoutMs !== undefined
        ? await this.http.request<T>(url, { method: "GET", timeout: timeoutMs })
        : await this.http.get<T>(url);

    if (!response.ok) {
      const errMsg = `Shelly RPC ${method} failed for "${name}" (${device.host}): HTTP ${response.status}`;
      this.logger.error(
        { device: name, host: device.host, method, status: response.status },
        errMsg,
      );
      throw new Error(errMsg);
    }

    // Validate the parsed body before returning it to callers. A Shelly device
    // can return an RPC error object (e.g. `{ error: ... }`) with HTTP 200;
    // casting that blindly to the typed shape would yield `undefined`/`NaN`.
    const data = response.data as unknown;
    if (data === null || typeof data !== "object") {
      const errMsg = `Shelly RPC ${method} for "${name}" (${device.host}) returned an unexpected response body`;
      this.logger.error({ device: name, host: device.host, method }, errMsg);
      throw new Error(errMsg);
    }
    if ("error" in data) {
      const rpcError = (data as { error: unknown }).error;
      const errMsg = `Shelly RPC ${method} for "${name}" (${device.host}) returned an error: ${JSON.stringify(rpcError)}`;
      this.logger.error({ device: name, host: device.host, method, rpcError }, errMsg);
      throw new Error(errMsg);
    }

    this.logger.debug({ device: name, method, result: response.data }, "Shelly RPC response");

    return response.data;
  }

  /**
   * Execute an RPC call over the MQTT RPC channel, correlating the response by request
   * `id` with a fixed 5s timeout.
   */
  private async mqttRpc<T>(
    device: ShellyDevice,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    this.ensureMqttRpcSubscribed();

    const topicPrefix = device.topicPrefix as string;
    const id = ++this.mqttRpcId;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingMqttRpc.delete(id);
        const errMsg = `Shelly MQTT RPC ${method} for "${device.name}" (${topicPrefix}) timed out after ${MQTT_RPC_TIMEOUT_MS}ms`;
        this.logger.error(
          { device: device.name, topicPrefix, method, timeoutMs: MQTT_RPC_TIMEOUT_MS },
          errMsg,
        );
        reject(new Error(errMsg));
      }, MQTT_RPC_TIMEOUT_MS);

      this.pendingMqttRpc.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timer,
        device: device.name,
        topicPrefix,
        method,
      });

      this.mqtt.publish(`${topicPrefix}/rpc`, {
        id,
        src: this.mqttRpcSrc,
        method,
        ...(params !== undefined ? { params } : {}),
      });
    });
  }

  /**
   * Lazily subscribe once to the shared `<src>/rpc` response topic, on first
   * MQTT RPC call. Incoming frames are correlated to pending requests by `id`.
   */
  private ensureMqttRpcSubscribed(): void {
    if (this.mqttRpcSubscribed) return;
    this.mqttRpcSubscribed = true;

    this.mqtt.subscribe(`${this.mqttRpcSrc}/rpc`, (_topic, payload) => {
      this.handleMqttRpcResponse(payload as unknown as ShellyMqttRpcResponse);
    });
  }

  /** Handle an incoming MQTT RPC response frame, resolving/rejecting by `id`. */
  private handleMqttRpcResponse(response: ShellyMqttRpcResponse): void {
    const id = response?.id;
    if (typeof id !== "number") {
      this.logger.warn({ response }, "Received malformed Shelly MQTT RPC response — skipping");
      return;
    }

    const pending = this.pendingMqttRpc.get(id);
    if (!pending) {
      // No pending request for this id — likely a stale/duplicate response.
      return;
    }

    this.pendingMqttRpc.delete(id);
    clearTimeout(pending.timer);

    if (response.error !== undefined) {
      const errMsg = `Shelly MQTT RPC ${pending.method} for "${pending.device}" (${pending.topicPrefix}) returned an error: ${JSON.stringify(response.error)}`;
      this.logger.error(
        {
          device: pending.device,
          topicPrefix: pending.topicPrefix,
          method: pending.method,
          rpcError: response.error,
        },
        errMsg,
      );
      pending.reject(new Error(errMsg));
      return;
    }

    if (response.result !== undefined) {
      this.logger.debug(
        { device: pending.device, method: pending.method, result: response.result },
        "Shelly MQTT RPC response",
      );
      pending.resolve(response.result);
      return;
    }

    const errMsg = `Shelly MQTT RPC ${pending.method} for "${pending.device}" (${pending.topicPrefix}) returned an unexpected response body`;
    this.logger.error(
      { device: pending.device, topicPrefix: pending.topicPrefix, method: pending.method },
      errMsg,
    );
    pending.reject(new Error(errMsg));
  }
}
