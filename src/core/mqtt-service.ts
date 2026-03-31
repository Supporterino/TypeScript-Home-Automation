import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import type { Logger } from "pino";
import type { Config } from "../config.js";
import { topicMatches } from "./mqtt-utils.js";

export type MqttMessageHandler = (topic: string, payload: Record<string, unknown>) => void;

interface Subscription {
  topic: string;
  handler: MqttMessageHandler;
}

export class MqttService {
  private client: MqttClient | null = null;
  private subscriptions: Subscription[] = [];
  private connected = false;

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
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(message.toString());
        } catch {
          // Not all messages are JSON - some are plain strings (e.g. bridge state)
          payload = { raw: message.toString() };
        }

        this.logger.debug({ topic, payload }, "MQTT message received");

        for (const sub of this.subscriptions) {
          if (topicMatches(sub.topic, topic)) {
            try {
              sub.handler(topic, payload);
            } catch (err) {
              this.logger.error(
                { err, topic, subscription: sub.topic },
                "Error in MQTT message handler",
              );
            }
          }
        }
      });
    });
  }

  subscribe(topic: string, handler: MqttMessageHandler): void {
    this.subscriptions.push({ topic, handler });

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
    this.subscriptions = this.subscriptions.filter(
      (sub) => !(sub.topic === topic && sub.handler === handler),
    );

    // Only unsubscribe from the broker if no other handlers need this topic
    const stillNeeded = this.subscriptions.some((sub) => sub.topic === topic);
    if (!stillNeeded && this.client && this.connected) {
      this.client.unsubscribe(topic);
      this.logger.debug({ topic }, "Unsubscribed from MQTT topic");
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

  /**
   * Re-subscribe to all registered topics after a (re)connection.
   */
  private resubscribeAll(): void {
    for (const sub of this.subscriptions) {
      this.client?.subscribe(sub.topic, (err) => {
        if (err) {
          this.logger.error({ topic: sub.topic, err }, "Failed to subscribe");
        }
      });
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.logger.info("Disconnecting from MQTT broker");
      await this.client.endAsync();
      this.client = null;
      this.connected = false;
    }
  }
}
