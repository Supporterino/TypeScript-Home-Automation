/**
 * The wall room widget: shows a configured room's devices as their own class's card,
 * plus room-wide all-on/all-off controls.
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
import {
  WallCardActions,
  WallCardControl,
  WallCardLabel,
  WallCardMessage,
  WallCardReading,
  WallCardStateItem,
} from "../cards/card-anatomy.js";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_SECONDARY_FONT_SIZE } from "../cards/metrics.js";
import { widgetTitle } from "../frame.js";
import type { WallWidgetProps } from "../registry.js";
import { WALL_BODY_FONT_SIZE } from "../type-ramp.js";
import { WallDeviceCard, WallDeviceUnavailable, wallTileCardBox } from "./DeviceWidget.js";
import { PagedTileGrid } from "./PagedTileGrid.js";
import { actuatableRoomMembers, roomTiles } from "./room-model.js";

/**
 * The grid rows the card's own chrome consumes above the tiles at the resolved row
 * unit. The command's outcome is drawn over the card's foot, not in the column.
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
      <WallCardStateItem icon={<House size={WALL_CARD_GLYPH_SIZE} />} label={room.name} />

      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--hearth-space-2)" }}>
        <WallCardReading>{memberCount}</WallCardReading>
        <WallCardLabel>{memberCount === 1 ? "device" : "devices"}</WallCardLabel>
      </div>

      {hasActuatable && (
        <WallCardActions>
          <WallCardControl
            disabled={commandBusy}
            onClick={() => void handleRoomCommand(true)}
            glyph={commandBusy ? <Spinner size={18} label="" /> : <Power size={18} aria-hidden />}
            label="All on"
          />
          <WallCardControl
            disabled={commandBusy}
            onClick={() => void handleRoomCommand(false)}
            glyph={commandBusy ? <Spinner size={18} label="" /> : <Power size={18} aria-hidden />}
            label="All off"
          />
        </WallCardActions>
      )}

      {tiles.length === 0 ? (
        <WallCardMessage>No devices in this room yet.</WallCardMessage>
      ) : (
        <PagedTileGrid
          items={tiles}
          keyOf={(tile) => tile.qualifiedId}
          renderTile={(tile, box) =>
            tile.device ? (
              // The tile composes for the box the grid drew it in.
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

      {/* The command's outcome is drawn over the card's foot, not in its column. */}
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
                fontSize: WALL_CARD_SECONDARY_FONT_SIZE,
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
