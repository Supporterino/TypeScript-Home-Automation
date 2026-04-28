import type { Logger } from "pino";
import type {
  NanoleafDeviceInfo,
  NanoleafPanelLayout,
  NanoleafState,
  NanoleafStateSet,
} from "../../types/nanoleaf.js";
import type { HttpClient } from "../http/http-client.js";

/**
 * Configuration for registering a Nanoleaf device.
 */
export interface NanoleafDeviceConfig {
  /** IP address, hostname, or URL of the Nanoleaf device. */
  host: string;
  /** Auth token generated via pairing (POST /api/v1/new). */
  token: string;
  /** Port override (default: 16021). */
  port?: number;
}

/**
 * A registered Nanoleaf device with its resolved base URL.
 */
interface NanoleafDevice {
  name: string;
  baseUrl: string;
}

/**
 * Service for interacting with Nanoleaf devices over their local HTTP API.
 *
 * Supports Light Panels, Canvas, Shapes, Elements, and Lines.
 * Devices are registered by name with a host and auth token, then
 * controlled via convenience methods.
 *
 * @example
 * ```ts
 * // In an automation:
 * const nanoleaf = this.services.get<NanoleafService>("nanoleaf");
 * if (!nanoleaf) return;
 * await nanoleaf.turnOn("panels");
 * await nanoleaf.setBrightness("panels", 80, 2);
 * await nanoleaf.setColor("panels", 120, 100);
 * await nanoleaf.setEffect("panels", "Northern Lights");
 * ```
 */
export class NanoleafService {
  private readonly devices: Map<string, NanoleafDevice> = new Map();

  constructor(
    private readonly http: HttpClient,
    private readonly logger: Logger,
  ) {}

  /**
   * Register a Nanoleaf device for use in automations.
   *
   * Accepts IP addresses, hostnames, mDNS names, or full URLs.
   * The scheme and trailing slashes are stripped automatically.
   *
   * @param name Friendly name for the device (used in all other methods)
   * @param config Device configuration (host, token, optional port)
   */
  register(name: string, config: NanoleafDeviceConfig): void {
    const host = this.normalizeHost(config.host);
    const port = config.port ?? 16021;
    const baseUrl = `http://${host}:${port}/api/v1/${config.token}`;
    this.devices.set(name, { name, baseUrl });
    this.logger.info({ name, host, port }, "Nanoleaf device registered");
  }

  /**
   * Register multiple Nanoleaf devices at once.
   */
  registerMany(devices: Record<string, NanoleafDeviceConfig>): void {
    for (const [name, config] of Object.entries(devices)) {
      this.register(name, config);
    }
  }

  // -------------------------------------------------------------------------
  // Power control
  // -------------------------------------------------------------------------

  /** Turn the device on. */
  async turnOn(name: string): Promise<void> {
    this.logger.info({ device: name }, "Turning Nanoleaf on");
    await this.setState(name, { on: { value: true } });
  }

  /** Turn the device off. */
  async turnOff(name: string): Promise<void> {
    this.logger.info({ device: name }, "Turning Nanoleaf off");
    await this.setState(name, { on: { value: false } });
  }

  /** Toggle power. Reads current state and inverts it. */
  async toggle(name: string): Promise<void> {
    const state = await this.getState(name);
    const newValue = !state.on.value;
    this.logger.info({ device: name, on: newValue }, "Toggling Nanoleaf");
    await this.setState(name, { on: { value: newValue } });
  }

  // -------------------------------------------------------------------------
  // Brightness
  // -------------------------------------------------------------------------

  /**
   * Set brightness.
   *
   * @param name Device friendly name
   * @param value Brightness 0-100
   * @param duration Transition time in seconds (optional)
   */
  async setBrightness(name: string, value: number, duration?: number): Promise<void> {
    this.logger.info({ device: name, brightness: value, duration }, "Setting Nanoleaf brightness");
    await this.setState(name, {
      brightness: duration !== undefined ? { value, duration } : { value },
    });
  }

  // -------------------------------------------------------------------------
  // Color
  // -------------------------------------------------------------------------

  /**
   * Set color using hue and saturation.
   *
   * @param name Device friendly name
   * @param hue Hue 0-360
   * @param saturation Saturation 0-100
   */
  async setColor(name: string, hue: number, saturation: number): Promise<void> {
    this.logger.info({ device: name, hue, saturation }, "Setting Nanoleaf color");
    await this.setState(name, {
      hue: { value: hue },
      sat: { value: saturation },
    });
  }

  /**
   * Set color temperature.
   *
   * @param name Device friendly name
   * @param value Color temperature in Kelvin (1200-6500)
   */
  async setColorTemp(name: string, value: number): Promise<void> {
    this.logger.info({ device: name, colorTemp: value }, "Setting Nanoleaf color temperature");
    await this.setState(name, { ct: { value } });
  }

  // -------------------------------------------------------------------------
  // State (combined set/get)
  // -------------------------------------------------------------------------

  /**
   * Set multiple state properties at once.
   *
   * @param name Device friendly name
   * @param state State properties to set
   */
  async setState(name: string, state: NanoleafStateSet): Promise<void> {
    await this.put(name, "/state", state);
  }

  /**
   * Get the full device state.
   *
   * @param name Device friendly name
   */
  async getState(name: string): Promise<NanoleafState> {
    const info = await this.get<NanoleafDeviceInfo>(name, "");
    return info.state;
  }

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  /**
   * List available effect names.
   *
   * @param name Device friendly name
   */
  async getEffects(name: string): Promise<string[]> {
    return this.get<string[]>(name, "/effects/effectsList");
  }

  /**
   * Get the currently active effect name.
   *
   * @param name Device friendly name
   */
  async getCurrentEffect(name: string): Promise<string> {
    return this.get<string>(name, "/effects/select");
  }

  /**
   * Activate an effect by name.
   *
   * @param name Device friendly name
   * @param effectName Name of the effect to activate
   */
  async setEffect(name: string, effectName: string): Promise<void> {
    this.logger.info({ device: name, effect: effectName }, "Setting Nanoleaf effect");
    await this.put(name, "/effects", { select: effectName });
  }

  // -------------------------------------------------------------------------
  // Device info & identification
  // -------------------------------------------------------------------------

  /**
   * Get full device information (name, serial, firmware, model, etc.).
   *
   * @param name Device friendly name
   */
  async getDeviceInfo(name: string): Promise<NanoleafDeviceInfo> {
    return this.get<NanoleafDeviceInfo>(name, "");
  }

  /**
   * Get the panel layout (positions and IDs of all panels).
   *
   * @param name Device friendly name
   */
  async getPanelLayout(name: string): Promise<NanoleafPanelLayout> {
    return this.get<NanoleafPanelLayout>(name, "/panelLayout/layout");
  }

  /**
   * Flash the panels for identification.
   *
   * @param name Device friendly name
   */
  async identify(name: string): Promise<void> {
    this.logger.info({ device: name }, "Identifying Nanoleaf device");
    await this.put(name, "/identify", {});
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Normalize a host string by stripping scheme and trailing slashes.
   */
  private normalizeHost(host: string): string {
    let normalized = host.trim();
    normalized = normalized.replace(/^https?:\/\//, "");
    normalized = normalized.replace(/\/+$/, "");
    // Strip port if included (we add it ourselves)
    normalized = normalized.replace(/:16021$/, "");
    return normalized;
  }

  /**
   * Look up a registered device by name.
   */
  private getDevice(name: string): NanoleafDevice {
    const device = this.devices.get(name);
    if (!device) {
      throw new Error(
        `Nanoleaf device "${name}" is not registered. Call nanoleaf.register("${name}", { host, token }) first.`,
      );
    }
    return device;
  }

  /**
   * GET request to a Nanoleaf device.
   */
  private async get<T>(name: string, path: string): Promise<T> {
    const device = this.getDevice(name);
    const url = `${device.baseUrl}${path}`;
    const response = await this.http.get<T>(url);

    if (!response.ok) {
      const errMsg = `Nanoleaf GET ${path} failed for "${name}": HTTP ${response.status}`;
      this.logger.error({ device: name, path, status: response.status }, errMsg);
      throw new Error(errMsg);
    }

    return response.data;
  }

  /**
   * PUT request to a Nanoleaf device.
   */
  private async put(name: string, path: string, body: unknown): Promise<void> {
    const device = this.getDevice(name);
    const url = `${device.baseUrl}${path}`;
    const response = await this.http.put(url, body);

    if (!response.ok) {
      const errMsg = `Nanoleaf PUT ${path} failed for "${name}": HTTP ${response.status}`;
      this.logger.error({ device: name, path, status: response.status }, errMsg);
      throw new Error(errMsg);
    }
  }
}
