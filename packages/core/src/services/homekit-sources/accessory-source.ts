import type { CreatedAccessory } from "../homekit-accessory-factory.js";

/**
 * A source-agnostic supplier of HomeKit accessories.
 *
 * Each source is responsible for its own discovery, freshness, and write-back,
 * and interacts with the bridge only through an {@link AccessorySink}. This keeps
 * `HomekitService` a neutral bridge host that knows nothing about the underlying
 * device families (Zigbee2MQTT, Shelly RPC, …).
 */
export interface AccessorySource {
  /** Short identifier used for logging and to namespace accessory IDs. */
  readonly name: string;

  /**
   * Begin producing accessories. The source should replay any devices it
   * already knows about, subscribe to whatever change/freshness mechanism it
   * uses, and add/remove accessories through the given sink.
   */
  start(sink: AccessorySink): Promise<void> | void;

  /**
   * Stop producing accessories and detach all listeners, intervals, and other
   * resources the source created in `start`.
   */
  stop(): Promise<void> | void;
}

/**
 * The bridge-side surface an {@link AccessorySource} uses to add and remove
 * accessories. Implemented by `HomekitService`.
 *
 * IDs passed here MUST be unique across sources (sources namespace their IDs by
 * source name) so accessories from different families never collide even when
 * they share a friendly name.
 */
export interface AccessorySink {
  /** Bridge an accessory under a globally-unique id. */
  add(id: string, accessory: CreatedAccessory): void;
  /** Remove a previously-added accessory by id. */
  remove(id: string): void;
}
