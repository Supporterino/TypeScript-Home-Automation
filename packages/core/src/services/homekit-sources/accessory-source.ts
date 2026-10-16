import type { CreatedAccessory } from "../homekit-descriptor-factory.js";

/**
 * A source-agnostic supplier of HomeKit accessories, interacting with the bridge only
 * through an {@link AccessorySink}.
 */
export interface AccessorySource {
  /** Short identifier used for logging and to namespace accessory IDs. */
  readonly name: string;

  /**
   * Begin producing accessories: replay known devices, subscribe to changes, and
   * add/remove through the given sink.
   */
  start(sink: AccessorySink): Promise<void> | void;

  /** Stop producing accessories and detach every resource created in `start`. */
  stop(): Promise<void> | void;
}

/**
 * The bridge-side surface an {@link AccessorySource} uses to add and remove
 * accessories; ids must be unique across sources. Implemented by `HomekitService`.
 */
export interface AccessorySink {
  /** Bridge an accessory under a globally-unique id. */
  add(id: string, accessory: CreatedAccessory): void;
  /** Remove a previously-added accessory by id. */
  remove(id: string): void;
}
