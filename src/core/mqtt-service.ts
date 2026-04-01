import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import type { Logger } from "pino";
import type { Config } from "../config.js";
import { hasWildcard, splitPattern, topicMatchesParts } from "./mqtt-utils.js";

export type MqttMessageHandler = (topic: string, payload: Record<string, unknown>) => void;

/**
 * A subscription to an exact (non-wildcard) topic.
 */
interface ExactSubscription {
  topic: string;
  handler: MqttMessageHandler;
}

/**
 * A subscription to a wildcard pattern (contains + or #).
 * The pattern is pre-split at subscribe time for faster matching.
 */
interface WildcardSubscription {
  topic: string;
  patternParts: string[];
  handler: MqttMessageHandler;
}

/**
 * MQTT client wrapper with optimized message dispatch.
 *
 * Subscriptions are split into two categories:
 * - **Exact topics** — indexed in a Map for O(1) lookup per message
 * - **Wildcard patterns** — iterated linearly (pre-split for faster matching)
 *
 * This means a message to `zigbee2mqtt/sensor_a` with 100 exact subscriptions
 * and 2 wildcard subscriptions only does 1 Map lookup + 2 pattern comparisons,
 * instead of 102 string splits + comparisons.
 *
 * JSON parsing is deferred until at least one handler matches, avoiding
 * wasted work for messages that no subscription cares about.
 */
export class MqttService {
  private client: MqttClient | null = null;
  private connected = false;

  /** Exact topic → handlers (O(1) lookup). */
  private readonly exactHandlers: Map<string, ExactSubscription[]> = new Map();
  /** Wildcard subscriptions (linear scan, pre-split patterns). */
  private readonly wildcardHandlers: WildcardSubscription[] = [];
  /** All subscription topics (for re-subscribe on reconnect + broker unsubscribe logic). */
  private readonly allTopics: Map<string, number> = new Map();

  /** Whether the MQTT client is currently connected to the broker. */
  get isConnected(): boolean {
    return this.connected;
  }

  constructor(
    private readonly config: Config,
    private readonly logger: Logger,
  ) {}

  async connect(): Promise<void> {
    const url = `mqtt://${this.config.mqtt.host}:${this.config.mqtt.port}`;
    this.logger.info({ url }, "Connecting to MQTT broker");

    const options: IClientOptions = {
      clientId: `home-automation-${Date.now()}`,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    };

    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(url, options);

      // Resolve the promise only on the initial connection
      this.client.once("connect", () => {
        this.connected = true;
        this.logger.info("Connected to MQTT broker");
        this.resubscribeAll();
        resolve();
      });

      // Re-subscribe on subsequent reconnections
      this.client.on("connect", () => {
        this.connected = true;
        this.logger.info("Reconnected to MQTT broker");
        this.resubscribeAll();
      });

      this.client.on("reconnect", () => {
        this.logger.warn("Reconnecting to MQTT broker...");
      });

      this.client.on("error", (err) => {
        this.logger.error({ err }, "MQTT connection error");
        if (!this.connected) {
          reject(err);
        }
      });

      this.client.on("offline", () => {
        this.connected = false;
        this.logger.warn("MQTT client offline");
      });

      this.client.on("message", (topic, message) => {
        this.dispatch(topic, message);
      });
    });
  }

  subscribe(topic: string, handler: MqttMessageHandler): void {
    if (hasWildcard(topic)) {
      this.wildcardHandlers.push({
        topic,
        patternParts: splitPattern(topic),
        handler,
      });
    } else {
      const existing = this.exactHandlers.get(topic);
      if (existing) {
        existing.push({ topic, handler });
      } else {
        this.exactHandlers.set(topic, [{ topic, handler }]);
      }
    }

    // Track topic reference count for broker subscription management
    const count = this.allTopics.get(topic) ?? 0;
    this.allTopics.set(topic, count + 1);

    if (this.client && this.connected) {
      this.client.subscribe(topic, (err) => {
        if (err) {
          this.logger.error({ topic, err }, "Failed to subscribe");
        } else {
          this.logger.debug({ topic }, "Subscribed to MQTT topic");
        }
      });
    }
  }

  unsubscribe(topic: string, handler: MqttMessageHandler): void {
    if (hasWildcard(topic)) {
      const idx = this.wildcardHandlers.findIndex(
        (sub) => sub.topic === topic && sub.handler === handler,
      );
      if (idx !== -1) this.wildcardHandlers.splice(idx, 1);
    } else {
      const handlers = this.exactHandlers.get(topic);
      if (handlers) {
        const idx = handlers.findIndex((sub) => sub.handler === handler);
        if (idx !== -1) handlers.splice(idx, 1);
        if (handlers.length === 0) this.exactHandlers.delete(topic);
      }
    }

    // Decrement reference count
    const count = this.allTopics.get(topic) ?? 0;
    if (count <= 1) {
      this.allTopics.delete(topic);
      if (this.client && this.connected) {
        this.client.unsubscribe(topic);
        this.logger.debug({ topic }, "Unsubscribed from MQTT topic");
      }
    } else {
      this.allTopics.set(topic, count - 1);
    }
  }

  publish(topic: string, payload: Record<string, unknown>): void {
    if (!this.client || !this.connected) {
      this.logger.error({ topic }, "Cannot publish - MQTT not connected");
      return;
    }

    const message = JSON.stringify(payload);
    this.client.publish(topic, message, (err) => {
      if (err) {
        this.logger.error({ topic, err }, "Failed to publish MQTT message");
      } else {
        this.logger.debug({ topic, payload }, "Published MQTT message");
      }
    });
  }

  /**
   * Publish a command to a Zigbee2MQTT device.
   * Convenience method that prepends the configured prefix and appends /set.
   */
  publishToDevice(friendlyName: string, payload: Record<string, unknown>): void {
    const topic = `${this.config.zigbee2mqttPrefix}/${friendlyName}/set`;
    this.publish(topic, payload);
  }

  /**
   * Build a full Zigbee2MQTT topic for a device friendly name.
   */
  deviceTopic(friendlyName: string): string {
    return `${this.config.zigbee2mqttPrefix}/${friendlyName}`;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.logger.info("Disconnecting from MQTT broker");
      await this.client.endAsync();
      this.client = null;
      this.connected = false;
    }
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Dispatch an incoming MQTT message to matching handlers.
   *
   * 1. Look up exact handlers by topic (O(1) Map lookup)
   * 2. Scan wildcard handlers (O(w) where w = wildcard count, typically small)
   * 3. Parse JSON only if at least one handler matched
   */
  private dispatch(topic: string, message: Buffer): void {
    // Collect matching handlers before parsing
    const exactSubs = this.exactHandlers.get(topic);
    const wildcardMatches: WildcardSubscription[] = [];

    for (const sub of this.wildcardHandlers) {
      if (topicMatchesParts(sub.patternParts, topic)) {
        wildcardMatches.push(sub);
      }
    }

    // No matches — skip JSON parsing entirely
    const hasExact = exactSubs && exactSubs.length > 0;
    if (!hasExact && wildcardMatches.length === 0) return;

    // Lazy parse: only when we have handlers to call
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(message.toString());
    } catch {
      payload = { raw: message.toString() };
    }

    this.logger.debug({ topic }, "MQTT message dispatched");

    // Dispatch to exact handlers
    if (exactSubs) {
      for (const sub of exactSubs) {
        try {
          sub.handler(topic, payload);
        } catch (err) {
          this.logger.error({ err, topic }, "Error in MQTT message handler");
        }
      }
    }

    // Dispatch to wildcard handlers
    for (const sub of wildcardMatches) {
      try {
        sub.handler(topic, payload);
      } catch (err) {
        this.logger.error({ err, topic, pattern: sub.topic }, "Error in MQTT message handler");
      }
    }
  }

  /**
   * Re-subscribe to all registered topics after a (re)connection.
   */
  private resubscribeAll(): void {
    for (const topic of this.allTopics.keys()) {
      this.client?.subscribe(topic, (err) => {
        if (err) {
          this.logger.error({ topic, err }, "Failed to subscribe");
        }
      });
    }
  }
}
