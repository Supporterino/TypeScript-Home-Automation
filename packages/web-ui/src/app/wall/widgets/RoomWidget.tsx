/**
 * The wall room widget (design.md D11, D13; wall-zones-and-fit D5;
 * specs/wall-display "Widget Catalog", "A room widget commands the room", "Panel
 * Fit"). Shows a configured room's devices as their own class's ported card, plus
 * room-wide all-on/all-off controls.
 *
 * The batch command reuses the same flow as `RoomView`: capable members are
 * grouped by the on/off property family they declare, every actuatable member
 * is reflected optimistically through the store-level override layer, then
 * the per-member responses are merged and classified — applied is left to the
 * stream or the deadline, failed reverts and is surfaced, skipped is reported
 * separately. Report-only members are never commanded.
 *
 * Composed on the shared Hearth card vocabulary (design.md D11): a leading room
 * glyph and the room name as the title, the member count as the metric, and the
 * room-wide all-on/all-off controls as the card's action-affordance slot. A
 * control widget: the frame draws the surface, so each contained card draws
 * none of its own (specs/wall-display "A card is a single surface").
 *
 * A room larger than the card can show pages its tiles through the wall's shared
 * pagination layer — one page at a time with touch page controls — rather than
 * scrolling its tile area, so the wall never scrolls (wall-zones-and-fit D5).
 */
import { House, Info, Power } from "lucide-react";
import { useState } from "react";
import { sendRoomCommand } from "../../api.js";
import { useDataStore } from "../../lib/data-store.js";
import {
  classifyRoomCommandResults,
  groupOnOffCommand,
  mergeRoomCommandResults,
} from "../../lib/room-command.js";
import type { DeviceDescriptor } from "../../types.js";
import { Spinner } from "../../ui/index.js";
import { widgetTitle } from "../frame.js";
import type { WallWidgetProps } from "../registry.js";
import { WALL_BODY_FONT_SIZE } from "../type-ramp.js";
import {
  WALL_CARD_GLYPH_SIZE,
  WallButton,
  WallCardAffordance,
  WallCardHead,
  WallCardLabel,
  WallCardMessage,
  WallCardMetric,
  wallControlGapPx,
} from "./card-vocab.js";
import { WallDeviceCard, WallDeviceUnavailable, wallTileCardBox } from "./DeviceWidget.js";
import { PagedTileGrid } from "./PagedTileGrid.js";
import { actuatableRoomMembers, roomTiles } from "./room-model.js";

/**
 * The grid rows the card's own chrome — the room glyph with its name, the member
 * count, and the room-wide command row — consumes above the tiles at the resolved
 * row unit. The page plan reserves it, so a page never promises a tile row the
 * card cannot show. The command's outcome is deliberately *not* part of it: the
 * error and the skipped count are drawn over the card's foot, so reporting a
 * command neither eats a tile row on a card at its minimum span nor reflows (and
 * so re-pages) the tiles that command just actuated.
 */
const ROOM_HEADER_ROWS = 3;

export function RoomWidget({ widget, contained, rowUnit }: WallWidgetProps) {
  const { rooms, applyOptimisticOverride, revertOptimisticOverride } = useDataStore();
  const roomId = typeof widget.config.roomId === "string" ? widget.config.roomId : "";
  const room = rooms.find((candidate) => candidate.id === roomId);

  const [commandBusy, setCommandBusy] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [skippedCount, setSkippedCount] = useState(0);

  if (!room) {
    return (
      <WallCardMessage>
        {roomId ? `Room "${roomId}" is not configured.` : "No room configured."}
      </WallCardMessage>
    );
  }

  const tileCount = room.members.length;
  const tiles = roomTiles(room.members);
  const hasActuatable = actuatableRoomMembers(room.members).length > 0;

  /**
   * Issues the room batch command, mirroring `RoomView`'s optimistic flow so
   * every mounted tile reflects the command and reverts a failed member.
   */
  async function handleRoomCommand(on: boolean) {
    if (!room) return;
    const capableMembers = actuatableRoomMembers(room.members);
    if (capableMembers.length === 0) return;

    setCommandBusy(true);
    setCommandError(null);
    setSkippedCount(0);

    const groups = groupOnOffCommand(capableMembers, on);

    const deviceByMember = new Map<string, DeviceDescriptor>();
    for (const member of room.members) {
      if (member.available && member.device) deviceByMember.set(member.qualifiedId, member.device);
    }

    const overrides: { qualifiedId: string; property: string; token: symbol }[] = [];
    for (const group of groups) {
      for (const member of group.members) {
        const token = applyOptimisticOverride(
          member.qualifiedId,
          group.property,
          group.value,
          deviceByMember.get(member.qualifiedId)?.observation,
        );
        overrides.push({ qualifiedId: member.qualifiedId, property: group.property, token });
      }
    }
    const overrideByMember = new Map(overrides.map((override) => [override.qualifiedId, override]));

    try {
      const responses = await Promise.all(
        groups.map((group) => sendRoomCommand(room.id, { [group.property]: group.value })),
      );
      const { skipped, failed } = classifyRoomCommandResults(mergeRoomCommandResults(responses));

      for (const qualifiedId of failed) {
        const override = overrideByMember.get(qualifiedId);
        if (override) {
          revertOptimisticOverride(qualifiedId, override.property, override.token);
        }
      }

      if (skipped.length > 0) setSkippedCount(skipped.length);
      if (failed.length > 0) {
        setCommandError(
          `${failed.length} member${failed.length === 1 ? "" : "s"} could not be commanded and reverted.`,
        );
      }
    } catch (err) {
      for (const { qualifiedId, property, token } of overrides) {
        revertOptimisticOverride(qualifiedId, property, token);
      }
      setCommandError(err instanceof Error ? err.message : "Room command failed");
    } finally {
      setCommandBusy(false);
    }
  }

  const memberCount = room.members.length;
  const hasNotice = commandError !== null || skippedCount > 0;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        height: "100%",
        minHeight: 0,
        flexDirection: "column",
        gap: "var(--hearth-space-3)",
      }}
    >
      <WallCardHead icon={<House size={WALL_CARD_GLYPH_SIZE} />} title={room.name} />

      <span style={{ display: "flex", alignItems: "baseline", gap: "var(--hearth-space-2)" }}>
        <WallCardMetric>{memberCount}</WallCardMetric>
        <WallCardLabel>{memberCount === 1 ? "device" : "devices"}</WallCardLabel>
      </span>

      {hasActuatable && (
        <WallCardAffordance>
          <WallButton disabled={commandBusy} onClick={() => void handleRoomCommand(true)}>
            {commandBusy ? <Spinner size={18} label="" /> : <Power size={18} aria-hidden />}
            All on
          </WallButton>
          <WallButton disabled={commandBusy} onClick={() => void handleRoomCommand(false)}>
            {commandBusy ? <Spinner size={18} label="" /> : <Power size={18} aria-hidden />}
            All off
          </WallButton>
        </WallCardAffordance>
      )}

      {tiles.length === 0 ? (
        <WallCardMessage>No devices in this room yet.</WallCardMessage>
      ) : (
        <PagedTileGrid
          items={tiles}
          keyOf={(tile) => tile.qualifiedId}
          renderTile={(tile, box) =>
            tile.device ? (
              // A paged tile composes for the box the grid drew it in: the page
              // plan's row height, which is the tile's own cell bounded against
              // inflation (design.md D2, D9; specs/wall-display "Paged Tile
              // Sizing"). Its composition is resolved from that box, so the same
              // device composes differently in a short room card and a tall one.
              <WallDeviceCard
                device={tile.device}
                contained={contained}
                box={wallTileCardBox(rowUnit, box.heightPx)}
              />
            ) : (
              <WallDeviceUnavailable qualifiedId={tile.qualifiedId} contained={contained} />
            )
          }
          span={widget}
          rowUnit={rowUnit}
          reservedRows={ROOM_HEADER_ROWS}
          titled={widgetTitle(widget) !== null}
          label="room devices"
        />
      )}

      {/* The command's outcome is drawn *over* the card's foot rather than in its
          column, so the card's own layout height — the geometry the page plan
          reserved for its header and its tile rows — does not change when a
          command reports. A failure must not reflow, and so re-page, the very
          tiles it just commanded (wall-zones-and-fit D5; specs/wall-display
          "Panel Fit"). The notices are informational, so they take no pointer
          events: the tile row under them stays fully operable by touch. */}
      {hasNotice && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--hearth-space-1)",
            pointerEvents: "none",
          }}
        >
          {commandError && (
            <p
              role="alert"
              style={{
                margin: 0,
                textAlign: "center",
                color: "var(--hearth-danger)",
                fontSize: WALL_BODY_FONT_SIZE,
              }}
            >
              {commandError}
            </p>
          )}

          {skippedCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--hearth-space-1)",
                padding: "2px var(--hearth-space-2)",
                borderRadius: "var(--hearth-radius-pill)",
                border: "1px solid var(--hearth-hairline)",
                color: "var(--hearth-text-muted)",
                fontSize: "var(--hearth-text-chip)",
                fontWeight: "var(--hearth-weight-semibold)",
              }}
            >
              <Info size={14} aria-hidden />
              {skippedCount} skipped (no control)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
