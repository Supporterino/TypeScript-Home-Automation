/**
 * The wall's typed device widget and the card dispatcher every device surface
 * shares: one widget type per device class points at one device.
 */
import { WALL_DEVICE_LAYOUTS, type WallTypedDeviceWidgetConfig } from "@ts-ha/shared";
import type { ComponentType, ReactNode } from "react";
import { useDataStore } from "../../lib/data-store.js";
import type { DeviceDescriptor } from "../../types.js";
import { ClimateCard } from "../cards/ClimateCard.js";
import { CoverCard } from "../cards/CoverCard.js";
import { WallCardMessage } from "../cards/card-anatomy.js";
import { placedDeviceCardBox, type WallCardBox } from "../cards/card-composition.js";
import {
  deviceCanDriveClass,
  isWallDeviceClass,
  resolveDeviceClass,
  WALL_DEVICE_CLASS_LABELS,
  type WallDeviceClass,
} from "../cards/device-class.js";
import { EntityCard } from "../cards/EntityCard.js";
import { FanCard } from "../cards/FanCard.js";
import { LightCard } from "../cards/LightCard.js";
import { LockCard } from "../cards/LockCard.js";
import { WALL_CARD_METRICS } from "../cards/metrics.js";
import { NumberCard } from "../cards/NumberCard.js";
import { SelectCard } from "../cards/SelectCard.js";
import type { WallDeviceCardProps } from "../cards/types.js";
import { WALL_TILE_CELL_COLUMNS } from "../pages.js";
import type { WallWidgetProps } from "../registry.js";

/**
 * The one card per device class, typed as a total record and frozen.
 */
const DEVICE_CLASS_CARDS: Readonly<Record<WallDeviceClass, ComponentType<WallDeviceCardProps>>> =
  Object.freeze({
    light: LightCard,
    cover: CoverCard,
    fan: FanCard,
    climate: ClimateCard,
    lock: LockCard,
    number: NumberCard,
    select: SelectCard,
    entity: EntityCard,
  });

/**
 * The card of one device class — the single place the catalogue's types and the
 * card modules are joined.
 */
export function wallDeviceCard(deviceClass: WallDeviceClass): ComponentType<WallDeviceCardProps> {
  return DEVICE_CLASS_CARDS[deviceClass];
}

/** The widget config a typed device card reads, narrowed from the wire's raw config. */
function typedDeviceConfig(
  qualifiedId: string,
  raw: Record<string, unknown>,
): WallTypedDeviceWidgetConfig {
  const layout = raw.layout;
  const collapsible = raw.collapsible_controls;
  return {
    qualifiedId,
    ...(typeof layout === "string" && (WALL_DEVICE_LAYOUTS as readonly string[]).includes(layout)
      ? { layout: layout as WallTypedDeviceWidgetConfig["layout"] }
      : {}),
    ...(typeof collapsible === "boolean" ? { collapsible_controls: collapsible } : {}),
  };
}

/** The contained-explanation wrapper every device surface uses. */
function ContainedExplanation({ children }: { children: ReactNode }): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <WallCardMessage>{children}</WallCardMessage>
    </div>
  );
}

/**
 * The wall typed device widget: its type names the class and therefore the card; the
 * bound device is resolved from the store.
 */
export function DeviceWidget({
  widget,
  contained,
  rendererHeightPx,
  rowUnit,
}: WallWidgetProps): ReactNode {
  const { devicesByQualifiedId } = useDataStore();
  const qualifiedId =
    typeof widget.config.qualifiedId === "string" ? widget.config.qualifiedId : "";
  const device = devicesByQualifiedId.get(qualifiedId);

  if (!device) {
    return (
      <ContainedExplanation>
        {qualifiedId ? `Device "${qualifiedId}" is not available.` : "No device configured."}
      </ContainedExplanation>
    );
  }

  // A non-device type here would be a registry wiring mistake; stay contained.
  if (!isWallDeviceClass(widget.type)) {
    return <ContainedExplanation>This widget is not a device widget.</ContainedExplanation>;
  }

  const deviceClass = widget.type;
  if (!deviceCanDriveClass(device.capabilities, deviceClass)) {
    return (
      <ContainedExplanation>
        {`This ${WALL_DEVICE_CLASS_LABELS[deviceClass]} widget needs a device its capabilities can drive; "${
          device.displayName
        }" cannot be driven by one.`}
      </ContainedExplanation>
    );
  }

  const Card = DEVICE_CLASS_CARDS[deviceClass];
  return (
    <Card
      device={device}
      config={typedDeviceConfig(qualifiedId, widget.config)}
      box={placedDeviceCardBox({
        columns: widget.w,
        rowUnit,
        heightPx: rendererHeightPx,
      })}
      contained={contained}
    />
  );
}

/**
 * The card of a device's own class, resolved from the device rather than a widget's
 * declared type.
 */
export function WallDeviceCard({
  device,
  box,
  contained,
}: {
  device: DeviceDescriptor;
  /** The box the tile is drawn in, in CSS pixels; omitted composes the fullest card. */
  box?: WallCardBox;
  contained?: boolean;
}): ReactNode {
  const Card = DEVICE_CLASS_CARDS[resolveDeviceClass(device.capabilities)];
  return <Card device={device} box={box} contained={contained} />;
}

/**
 * The box a paged tile is composed into: the tile's own cell width at the panel's row
 * unit, and the height the page plan resolved.
 */
export function wallTileCardBox(rowUnit: number, heightPx: number): WallCardBox {
  return placedDeviceCardBox({ columns: WALL_TILE_CELL_COLUMNS, rowUnit, heightPx });
}

/**
 * The wall's unavailable member: a tile whose device is not in the store, carrying no
 * control.
 */
export function WallDeviceUnavailable({
  qualifiedId,
  contained,
}: {
  qualifiedId: string;
  contained?: boolean;
}): ReactNode {
  const surface = contained
    ? {}
    : {
        background: "var(--hearth-surface)",
        border: "1px solid var(--hearth-hairline)",
        borderRadius: `${WALL_CARD_METRICS.radius}px`,
      };
  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        minWidth: 0,
        flexDirection: "column",
        justifyContent: "center",
        gap: WALL_CARD_METRICS.padding,
        padding: WALL_CARD_METRICS.padding,
        opacity: 0.6,
        boxSizing: "border-box",
        ...surface,
      }}
    >
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily: "monospace",
          fontSize: WALL_CARD_METRICS.secondarySize,
          color: "var(--hearth-text-muted)",
        }}
      >
        {qualifiedId}
      </span>
      <span
        style={{ fontSize: WALL_CARD_METRICS.secondarySize, color: "var(--hearth-text-muted)" }}
      >
        Unavailable
      </span>
    </div>
  );
}
