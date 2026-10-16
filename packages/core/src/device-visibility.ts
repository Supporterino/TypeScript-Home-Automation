import type { Logger } from "pino";
import { INTERNAL_STATE_PREFIX, type StateManager } from "./state/state-manager.js";

/**
 * Reserved-namespace prefix under which each device's hidden flag is stored,
 * keyed by the device's qualified identifier.
 */
export const HIDDEN_PREFIX = `${INTERNAL_STATE_PREFIX}hidden:`;

/** Returns the reserved state key storing `qualifiedId`'s hidden flag. */
export function hiddenKey(qualifiedId: string): string {
  return `${HIDDEN_PREFIX}${qualifiedId}`;
}

/** Emitted whenever a device's hidden flag changes. */
export interface VisibilityChange {
  qualifiedId: string;
  hidden: boolean;
}

export type VisibilityChangeListener = (change: VisibilityChange) => void;

/**
 * A persisted, per-device hidden flag; absence of `hiddenKey(qualifiedId)` means
 * visible. Takes only `StateManager`, so an unknown id can be hidden.
 */
export class DeviceVisibility {
  private readonly listeners: Set<VisibilityChangeListener> = new Set();

  constructor(
    private readonly stateManager: StateManager,
    private readonly logger: Logger,
  ) {}

  /** Mark a device hidden. Idempotent — hiding an already-hidden device changes nothing and fires no event. */
  hide(qualifiedId: string): void {
    const wasHidden = this.isHidden(qualifiedId);
    this.stateManager.setInternal(hiddenKey(qualifiedId), true);
    if (!wasHidden) this.notify(qualifiedId, true);
  }

  /** Mark a device visible. Idempotent — unhiding a visible device changes nothing and fires no event. */
  unhide(qualifiedId: string): void {
    const wasHidden = this.isHidden(qualifiedId);
    this.stateManager.deleteInternal(hiddenKey(qualifiedId));
    if (wasHidden) this.notify(qualifiedId, false);
  }

  /** Whether a device is currently hidden. Absence of the key means visible. */
  isHidden(qualifiedId: string): boolean {
    return this.stateManager.get<boolean>(hiddenKey(qualifiedId)) === true;
  }

  /** Every qualified id currently marked hidden. */
  listHidden(): string[] {
    return this.stateManager
      .keysInternal(HIDDEN_PREFIX)
      .map((key) => key.slice(HIDDEN_PREFIX.length));
  }

  /**
   * Register a listener fired whenever a device's hidden flag changes.
   * Each listener is isolated with its own try/catch — a throwing listener
   * does not prevent the others from being notified.
   */
  onChange(listener: VisibilityChangeListener): void {
    this.listeners.add(listener);
  }

  /** Remove a previously-registered visibility change listener. */
  offChange(listener: VisibilityChangeListener): void {
    this.listeners.delete(listener);
  }

  private notify(qualifiedId: string, hidden: boolean): void {
    for (const listener of this.listeners) {
      try {
        listener({ qualifiedId, hidden });
      } catch (err) {
        this.logger.error({ err, qualifiedId }, "Error in device visibility change listener");
      }
    }
  }
}
