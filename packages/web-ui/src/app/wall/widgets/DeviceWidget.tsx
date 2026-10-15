/**
 * The wall's typed device widget and the card dispatcher every device surface
 * shares (design.md D1, D3, D9, D10; specs/wall-display "Widget Catalog" — "A
 * card is selected by the device's class", "A class the device cannot drive is
 * explained" — and "Device Grid Widget"). One widget type per device class points
 * at one device; the widget's own type selects its card, and the bound device is
 * resolved from the data store.
 *
 * Two contained explanations live here, never a throw that would take down the
 * profile: a device that is not (or no longer) known, and a device whose
 * capabilities cannot drive the widget's class — the second is what a pending
 * class behaves as, and what a `light` widget bound to a sensor reports
 * (`deviceCanDriveClass`). The frame draws no surface for a device widget, so the
 * card owns it; the explanation uses the shared Hearth card vocabulary.
 *
 * {@link WallDeviceCard} is the same dispatcher keyed by the *device's* resolved
 * class instead of a widget's own type — the path the room, favorites, and device
 * grid tiles take, so a tile renders the card of its device's class exactly as a
 * placed widget does (design.md D9). It reads the device's class from the same
 * pure resolver, so the catalogue and the tiles cannot drift.
 *
 * Wall-chunk only (design.md D10).
 */
import { WALL_DEVICE_LAYOUTS, type WallTypedDeviceWidgetConfig } from "@ts-ha/shared";
import type { ComponentType, ReactNode } from "react";
import { useDataStore } from "../../lib/data-store.js";
import type { DeviceDescriptor } from "../../types.js";
import { ClimateCard } from "../cards/ClimateCard.js";
import { CoverCard } from "../cards/CoverCard.js";
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
import { WallCardMessage } from "./card-vocab.js";

/**
 * The one card per device class (design.md D1). Typed as a total record so a
 * class in the catalogue without a card — or a card without a catalogue entry —
 * is a compile error, and frozen so it cannot be mutated at runtime.
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
 * card modules are joined, so the registry, a widget, and a tile all resolve the
 * same component.
 */
export function wallDeviceCard(deviceClass: WallDeviceClass): ComponentType<WallDeviceCardProps> {
  return DEVICE_CLASS_CARDS[deviceClass];
}

/** The widget config a typed device card reads, narrowed from the wire's raw config (design.md D6). */
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

/** The contained-explanation wrapper every device surface uses (design.md D3). */
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
 * The wall typed device widget (design.md D1, D3; specs/wall-display "Widget
 * Catalog"). Its type names the class and therefore the card; the bound device is
 * resolved from the store. A widget whose bound device cannot drive its class
 * reports that inside its own area rather than presenting an inert card.
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

  // The registry renders only a typed device widget through this component, so a
  // non-device type here would be a registry wiring mistake; the fallback keeps
  // the surface contained rather than throwing from inside the wall.
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
 * The card of a device's own class, resolved from the device rather than a
 * widget's declared type (design.md D9; specs/wall-display "Device Grid Widget" —
 * "each presenting the card of its own device class"). A room's tiles, the
 * favorites grid, and the device grid all render through it, so a tile on the wall
 * is the same card a placed widget would draw.
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
 * The box a *paged tile* is composed into — the tile's own cell width
 * (`wall/pages.ts`'s {@link WALL_TILE_CELL_COLUMNS} columns) at the panel's row unit,
 * and the height the page plan resolved for the tile's row. Every paging host —
 * a room's tiles, the favorites grid, the device grid — hands its cards this, so a
 * tile composes for the cell it is drawn in rather than for the widget around it
 * (specs/wall-display "Paged Tile Sizing").
 */
export function wallTileCardBox(rowUnit: number, heightPx: number): WallCardBox {
  return placedDeviceCardBox({ columns: WALL_TILE_CELL_COLUMNS, rowUnit, heightPx });
}

/**
 * The wall's unavailable member (design.md D1; specs/wall-display "A card is a
 * single surface"). A tile whose device is not (or no longer) in the store draws
 * the wall's mute Hearth treatment rather than the dashboard's Lumen tile, and
 * carries no control: no live descriptor exists to actuate.
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
