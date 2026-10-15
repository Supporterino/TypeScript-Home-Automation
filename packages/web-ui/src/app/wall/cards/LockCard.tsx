/**
 * The wall lock card (design.md D1, D3, D6; specs/wall-display "Widget Catalog" —
 * "a lock"; "Wall Device Presentation" — "A card presents the ported anatomy").
 *
 * A lock is presented as discrete, touch-friendly actuation rather than a value: the
 * card composes the ported anatomy in order — the leading circular icon affordance,
 * the device's name over its locked/unlocked reading — and one actions row carrying
 * Lock and Unlock as touch-sized options, the one that matches the reported state
 * marked active. A lock that cannot express a command is not offered it: Lock/Unlock
 * are presented only for a writable property the device declares, and the exact
 * authored values are commanded so a device expecting `"LOCK"` is not sent `"lock"`.
 *
 * A lock is not idle the way a light is off — it is either locked or unlocked, and
 * both are states the user acts from — so its controls are always present and
 * `collapsible_controls` has nothing to hide.
 *
 * The pure decisions — the writable property, the exact lock/unlock values, the
 * state property, and what the reading says — are exported so they are reachable
 * by `bun test`. Wall-chunk only (design.md D10).
 */
import type { Capability } from "@ts-ha/shared";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { type FlatCapability, flattenCapabilities } from "../../lib/capability-ranking.js";
import { deviceTileObservation } from "../../lib/device-tile-state.js";
import { humanizeDeviceName, shortDeviceName } from "../../lib/humanize-name.js";
import { useNow } from "../../lib/use-now.js";
import { useOptimisticDeviceProperty } from "../../lib/use-optimistic-property.js";
import {
  WallCardActions,
  WallCardIcon,
  WallCardObservation,
  WallCardOption,
  WallCardText,
} from "./card-anatomy.js";
import {
  DEFAULT_WALL_CARD_BOX,
  resolveDeviceCardComposition,
  wallCardRootLayout,
} from "./card-composition.js";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_METRICS } from "./metrics.js";
import type { WallDeviceCardProps } from "./types.js";

/** The locked-like permitted values a lock's state can name (Zigbee2MQTT's own `LOCK`). */
const LOCK_TOKENS: ReadonlySet<string> = new Set(["lock", "locked"]);

/** The unlocked-like permitted values a lock's state can name (Zigbee2MQTT's own `UNLOCK`). */
const UNLOCK_TOKENS: ReadonlySet<string> = new Set(["unlock", "unlocked"]);

/** A lock card's resolved model (design.md D3): the property to drive and its two commands. */
export interface WallLockCardModel {
  /** The writable property the lock is driven on, or `undefined` when nothing is writable. */
  property: string | undefined;
  /** The exact value that locks the device. */
  lock: string | number | boolean | undefined;
  /** The exact value that unlocks the device. */
  unlock: string | number | boolean | undefined;
  /** The property carrying the lock's reported state. */
  stateProperty: string | undefined;
}

/** The permitted value a capability declares that matches one of `tokens`, preserving its authored case. */
function findToken(
  values: (string | number)[] | undefined,
  tokens: ReadonlySet<string>,
): string | undefined {
  return (values ?? []).find(
    (value): value is string => typeof value === "string" && tokens.has(value.trim().toLowerCase()),
  );
}

/** Whether a property name is one a lock reports its own state under. */
function isStateProperty(property: string): boolean {
  return property === "state" || property === "locked" || property === "lock";
}

/**
 * Resolves a lock's model (design.md D3; specs/wall-display "Widget Catalog"). The
 * lock is driven on the first writable property that can express both commands — a
 * `state` enum naming lock-like and unlock-like values, or a boolean `locked` whose
 * on/off encoding carries them. A lock with nothing writable reports no property,
 * so the card presents its reading alone rather than rendering inert controls.
 */
export function lockCardModel(capabilities: Capability[]): WallLockCardModel {
  const flat = flattenCapabilities(capabilities);

  for (const c of flat) {
    if (!c.access.writable) continue;
    if (c.valueType === "enum" && isStateProperty(c.property)) {
      const lock = findToken(c.permittedValues, LOCK_TOKENS);
      const unlock = findToken(c.permittedValues, UNLOCK_TOKENS);
      if (lock !== undefined && unlock !== undefined) {
        return { property: c.property, lock, unlock, stateProperty: c.property };
      }
    }
    if (c.valueType === "boolean" && isStateProperty(c.property)) {
      return {
        property: c.property,
        lock: c.valueOn ?? true,
        unlock: c.valueOff ?? false,
        stateProperty: c.property,
      };
    }
  }

  const readable = flat.find((c) => c.access.readable && isStateProperty(c.property));
  return {
    property: undefined,
    lock: undefined,
    unlock: undefined,
    stateProperty: readable?.property,
  };
}

/**
 * Whether a lock's reported state reads as locked: `true` for a lock-like value,
 * `false` for an unlock-like one, and `undefined` for a state neither token
 * matches — so the reading never guesses.
 */
export function lockCardLocked(stateValue: unknown): boolean | undefined {
  if (typeof stateValue !== "string") return undefined;
  const normalized = stateValue.trim().toLowerCase();
  if (LOCK_TOKENS.has(normalized)) return true;
  if (UNLOCK_TOKENS.has(normalized)) return false;
  return undefined;
}

/**
 * The card's reading: "Locked" or "Unlocked" for a recognised state, the state as
 * reported when it matches neither, and an em dash when the device reports none.
 */
export function lockCardReading(stateValue: unknown): string {
  const locked = lockCardLocked(stateValue);
  if (locked === true) return "Locked";
  if (locked === false) return "Unlocked";
  if (stateValue === undefined || stateValue === null) return "—";
  return String(stateValue);
}

export function LockCard({ device, config, box, contained }: WallDeviceCardProps): ReactNode {
  const now = useNow();
  const model = lockCardModel(device.capabilities);
  const disabled = !device.reachable;

  // One optimistic channel on the property the lock is driven on, called
  // unconditionally with an absent property when nothing is writable, so hook
  // order is stable (design.md D12).
  const control = useOptimisticDeviceProperty(
    device.qualifiedId,
    model.property ?? "",
    model.property ? device.state[model.property] : undefined,
    device.observation,
  );

  const composition = resolveDeviceCardComposition({
    box: box ?? DEFAULT_WALL_CARD_BOX,
    layout: config?.layout,
    collapsibleControls: config?.collapsible_controls,
    hasControls: model.property !== undefined,
    // A lock is either locked or unlocked, never idle, so its controls are always present.
    active: true,
  });

  const label = humanizeDeviceName(device.displayName);
  const state = model.stateProperty
    ? model.property === model.stateProperty
      ? control.value
      : device.state[model.stateProperty]
    : undefined;
  const locked = lockCardLocked(state);
  const surface = contained
    ? {}
    : { background: "var(--hearth-surface-raised)", borderRadius: WALL_CARD_METRICS.radius };

  return (
    <div
      style={{
        position: "relative",
        ...wallCardRootLayout(composition),
        minWidth: 0,
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        ...surface,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: WALL_CARD_METRICS.padding,
          minWidth: 0,
          padding: WALL_CARD_METRICS.padding,
        }}
      >
        <WallCardIcon
          glyph={<Lock size={WALL_CARD_GLYPH_SIZE} aria-hidden />}
          tint={locked === true ? "var(--hearth-on)" : "var(--hearth-off)"}
          disabled={disabled}
        />
        <WallCardText
          name={shortDeviceName(label)}
          state={lockCardReading(state)}
          prominent={composition.form === "full"}
        />
        <WallCardObservation observation={deviceTileObservation(device, now)} />
      </div>

      {composition.controls && model.property && (
        <WallCardActions>
          <WallCardOption
            label={`Lock ${label}`}
            active={locked === true}
            disabled={disabled}
            error={control.error !== null}
            onClick={() => control.setValue(model.lock)}
          />
          <WallCardOption
            label={`Unlock ${label}`}
            active={locked === false}
            disabled={disabled}
            error={control.error !== null}
            onClick={() => control.setValue(model.unlock)}
          />
        </WallCardActions>
      )}

      {control.error && (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: `0 ${WALL_CARD_METRICS.padding}px ${WALL_CARD_METRICS.padding}px`,
            color: "var(--hearth-danger)",
            fontSize: WALL_CARD_METRICS.secondarySize,
          }}
        >
          {control.error}
        </p>
      )}
    </div>
  );
}
