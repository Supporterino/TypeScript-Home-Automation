import type { Logger } from "pino";
import type {
  ShellyCoverConfig,
  ShellyCoverState,
  ShellyCoverStatus,
  ShellyDeviceInfo,
  ShellySwitchConfig,
  ShellySwitchSetResult,
  ShellySwitchStatus,
  ShellySysStatus,
} from "../types/shelly.js";
import type { HttpClient } from "./http-client.js";

/**
 * A registered Shelly device with its name and IP/hostname.
 */
export interface ShellyDevice {
  /** Friendly name for logging and lookup (e.g. "living_room_plug"). */
  name: string;
  /** IP address or hostname of the Shelly device. */
  host: string;
}

/**
 * Service for interacting with Shelly Gen 2 devices over their HTTP RPC API.
 *
 * Devices are registered by name and host, then controlled via convenience
 * methods. Uses HTTP GET requests to the device's `/rpc/<Method>` endpoints.
 *
 * @example
 * ```ts
 * // Inside an automation:
 * await this.shelly.turnOn("living_room_plug");
 * await this.shelly.turnOff("living_room_plug");
 *
 * const status = await this.shelly.getStatus("living_room_plug");
 * this.logger.info({ power: status.apower }, "Current power draw");
 * ```
 */
export class ShellyService {
  private devices: Map<string, ShellyDevice> = new Map();

  constructor(
    private readonly http: HttpClient,
    private readonly logger: Logger,
  ) {}

  /**
   * Register a Shelly device for use in automations.
   *
   * @param name Friendly name for the device (used in all other methods)
   * @param host IP address or hostname of the Shelly device
   */
  register(name: string, host: string): void {
    this.devices.set(name, { name, host });
    this.logger.info({ name, host }, "Shelly device registered");
  }

  /**
   * Register multiple Shelly devices at once.
   *
   * @param devices Array of { name, host } objects or a Record<name, host>
   */
  registerMany(devices: ShellyDevice[] | Record<string, string>): void {
    if (Array.isArray(devices)) {
      for (const device of devices) {
        this.register(device.name, device.host);
      }
    } else {
      for (const [name, host] of Object.entries(devices)) {
        this.register(name, host);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Switch control
  // -------------------------------------------------------------------------

  /**
   * Turn a Shelly switch on.
   *
   * @param name Device friendly name
   * @param toggleAfter Optional: automatically toggle back after N seconds
   * @returns The switch state before the command
   */
  async turnOn(name: string, toggleAfter?: number): Promise<ShellySwitchSetResult> {
    const params = new URLSearchParams({ id: "0", on: "true" });
    if (toggleAfter !== undefined) {
      params.set("toggle_after", String(toggleAfter));
    }
    this.logger.info({ device: name }, "Turning Shelly switch ON");
    return this.rpc<ShellySwitchSetResult>(name, "Switch.Set", params);
  }

  /**
   * Turn a Shelly switch off.
   *
   * @param name Device friendly name
   * @param toggleAfter Optional: automatically toggle back after N seconds
   * @returns The switch state before the command
   */
  async turnOff(name: string, toggleAfter?: number): Promise<ShellySwitchSetResult> {
    const params = new URLSearchParams({ id: "0", on: "false" });
    if (toggleAfter !== undefined) {
      params.set("toggle_after", String(toggleAfter));
    }
    this.logger.info({ device: name }, "Turning Shelly switch OFF");
    return this.rpc<ShellySwitchSetResult>(name, "Switch.Set", params);
  }

  /**
   * Toggle a Shelly switch.
   *
   * @param name Device friendly name
   * @returns The switch state before the command
   */
  async toggle(name: string): Promise<ShellySwitchSetResult> {
    this.logger.info({ device: name }, "Toggling Shelly switch");
    return this.rpc<ShellySwitchSetResult>(name, "Switch.Toggle", new URLSearchParams({ id: "0" }));
  }

  // -------------------------------------------------------------------------
  // Cover/shutter control (Shelly Plus 2PM in roller mode)
  // -------------------------------------------------------------------------

  /**
   * Open a Shelly cover/shutter.
   *
   * @param name Device friendly name
   * @param duration Optional: stop after N seconds (partial open)
   */
  async coverOpen(name: string, duration?: number): Promise<void> {
    const params = new URLSearchParams({ id: "0" });
    if (duration !== undefined) {
      params.set("duration", String(duration));
    }
    this.logger.info({ device: name }, "Opening Shelly cover");
    await this.rpc(name, "Cover.Open", params);
  }

  /**
   * Close a Shelly cover/shutter.
   *
   * @param name Device friendly name
   * @param duration Optional: stop after N seconds (partial close)
   */
  async coverClose(name: string, duration?: number): Promise<void> {
    const params = new URLSearchParams({ id: "0" });
    if (duration !== undefined) {
      params.set("duration", String(duration));
    }
    this.logger.info({ device: name }, "Closing Shelly cover");
    await this.rpc(name, "Cover.Close", params);
  }

  /**
   * Stop a Shelly cover/shutter.
   *
   * @param name Device friendly name
   */
  async coverStop(name: string): Promise<void> {
    this.logger.info({ device: name }, "Stopping Shelly cover");
    await this.rpc(name, "Cover.Stop", new URLSearchParams({ id: "0" }));
  }

  /**
   * Move a Shelly cover/shutter to an absolute position.
   * Requires the cover to be calibrated.
   *
   * @param name Device friendly name
   * @param position Target position 0–100 (0 = closed, 100 = fully open)
   */
  async coverGoToPosition(name: string, position: number): Promise<void> {
    const params = new URLSearchParams({ id: "0", pos: String(position) });
    this.logger.info({ device: name, position }, "Moving Shelly cover to position");
    await this.rpc(name, "Cover.GoToPosition", params);
  }

  /**
   * Move a Shelly cover/shutter by a relative offset.
   * Requires the cover to be calibrated.
   *
   * @param name Device friendly name
   * @param offset Relative position change (-100 to 100, positive = open, negative = close)
   */
  async coverMoveRelative(name: string, offset: number): Promise<void> {
    const params = new URLSearchParams({ id: "0", rel: String(offset) });
    this.logger.info({ device: name, offset }, "Moving Shelly cover by relative offset");
    await this.rpc(name, "Cover.GoToPosition", params);
  }

  /**
   * Get the current status of a Shelly cover (position, state, power).
   *
   * @param name Device friendly name
   */
  async getCoverStatus(name: string): Promise<ShellyCoverStatus> {
    return this.rpc<ShellyCoverStatus>(name, "Cover.GetStatus", new URLSearchParams({ id: "0" }));
  }

  /**
   * Get the configuration of a Shelly cover.
   *
   * @param name Device friendly name
   */
  async getCoverConfig(name: string): Promise<ShellyCoverConfig> {
    return this.rpc<ShellyCoverConfig>(name, "Cover.GetConfig", new URLSearchParams({ id: "0" }));
  }

  /**
   * Start calibration of a Shelly cover. The cover will open and close
   * fully to measure travel times.
   *
   * @param name Device friendly name
   */
  async coverCalibrate(name: string): Promise<void> {
    this.logger.warn({ device: name }, "Starting Shelly cover calibration");
    await this.rpc(name, "Cover.Calibrate", new URLSearchParams({ id: "0" }));
  }

  /**
   * Get the current position of a Shelly cover (0–100, null if uncalibrated).
   *
   * @param name Device friendly name
   */
  async getCoverPosition(name: string): Promise<number | null> {
    const status = await this.getCoverStatus(name);
    return status.current_pos;
  }

  /**
   * Get the current state of a Shelly cover.
   *
   * @param name Device friendly name
   */
  async getCoverState(name: string): Promise<ShellyCoverState> {
    const status = await this.getCoverStatus(name);
    return status.state;
  }

  // -------------------------------------------------------------------------
  // Status and info (shared across Switch and Cover devices)
  // -------------------------------------------------------------------------

  /**
   * Get the current status of a Shelly switch (including power metering).
   *
   * @param name Device friendly name
   */
  async getStatus(name: string): Promise<ShellySwitchStatus> {
    return this.rpc<ShellySwitchStatus>(name, "Switch.GetStatus", new URLSearchParams({ id: "0" }));
  }

  /**
   * Get the configuration of a Shelly switch.
   *
   * @param name Device friendly name
   */
  async getConfig(name: string): Promise<ShellySwitchConfig> {
    return this.rpc<ShellySwitchConfig>(name, "Switch.GetConfig", new URLSearchParams({ id: "0" }));
  }

  /**
   * Get device identification info.
   *
   * @param name Device friendly name
   */
  async getDeviceInfo(name: string): Promise<ShellyDeviceInfo> {
    return this.rpc<ShellyDeviceInfo>(name, "Shelly.GetDeviceInfo");
  }

  /**
   * Get system-level status (uptime, RAM, firmware updates, etc.).
   *
   * @param name Device friendly name
   */
  async getSysStatus(name: string): Promise<ShellySysStatus> {
    return this.rpc<ShellySysStatus>(name, "Sys.GetStatus");
  }

  /**
   * Check if the switch is currently on.
   *
   * @param name Device friendly name
   */
  async isOn(name: string): Promise<boolean> {
    const status = await this.getStatus(name);
    return status.output;
  }

  /**
   * Get the current power consumption in Watts.
   *
   * @param name Device friendly name
   */
  async getPower(name: string): Promise<number> {
    const status = await this.getStatus(name);
    return status.apower;
  }

  /**
   * Reboot a Shelly device.
   *
   * @param name Device friendly name
   * @param delayMs Optional: delay in milliseconds before rebooting
   */
  async reboot(name: string, delayMs?: number): Promise<void> {
    const params = delayMs ? new URLSearchParams({ delay_ms: String(delayMs) }) : undefined;
    this.logger.warn({ device: name }, "Rebooting Shelly device");
    await this.rpc(name, "Shelly.Reboot", params);
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Look up a registered device by name.
   * Throws if the device is not registered.
   */
  private getDevice(name: string): ShellyDevice {
    const device = this.devices.get(name);
    if (!device) {
      throw new Error(
        `Shelly device "${name}" is not registered. Call shelly.register("${name}", "<ip>") first.`,
      );
    }
    return device;
  }

  /**
   * Execute an RPC call to a Shelly device via HTTP GET.
   *
   * @param name Device friendly name
   * @param method RPC method (e.g. "Switch.Set")
   * @param params URL search params for the request
   */
  private async rpc<T>(name: string, method: string, params?: URLSearchParams): Promise<T> {
    const device = this.getDevice(name);
    const query = params ? `?${params.toString()}` : "";
    const url = `http://${device.host}/rpc/${method}${query}`;

    const response = await this.http.get<T>(url);

    if (!response.ok) {
      const errMsg = `Shelly RPC ${method} failed for "${name}" (${device.host}): HTTP ${response.status}`;
      this.logger.error(
        { device: name, host: device.host, method, status: response.status },
        errMsg,
      );
      throw new Error(errMsg);
    }

    this.logger.debug({ device: name, method, result: response.data }, "Shelly RPC response");

    return response.data;
  }
}
