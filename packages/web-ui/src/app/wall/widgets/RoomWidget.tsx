/**
 * The wall room widget (design.md D11, D13; specs/wall-display "Widget Catalog",
 * "A room widget commands the room"). Shows a configured room's devices as
 * touch-sized tiles plus room-wide all-on/all-off controls.
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
 * control widget: the frame draws the surface, so each contained tile draws
 * none of its own (specs/wall-display "A card is a single surface").
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
import { actuatableRoomMembers } from "./room-model.js";
import { WallDeviceTile } from "./WallDeviceTile.js";

export function RoomWidget({ widget, contained }: WallWidgetProps) {
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

  const availableMembers = room.members.filter((member) => member.available && member.device);
  const unavailableMembers = room.members.filter((member) => !member.available);
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

  return (
    <div
      style={{
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

      {commandError && (
        <p
          role="alert"
          style={{ margin: 0, color: "var(--hearth-danger)", fontSize: WALL_BODY_FONT_SIZE }}
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
            alignSelf: "flex-start",
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

      {availableMembers.length === 0 && unavailableMembers.length === 0 ? (
        <WallCardMessage>No devices in this room yet.</WallCardMessage>
      ) : (
        <div style={{ minHeight: 0, flex: 1, overflowY: "auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
              alignContent: "start",
              gap: `${wallControlGapPx()}px`,
            }}
          >
            {availableMembers.map((member) =>
              member.device ? (
                <WallDeviceTile
                  key={member.qualifiedId}
                  device={member.device}
                  contained={contained}
                />
              ) : null,
            )}
            {unavailableMembers.map((member) => (
              <WallDeviceTile
                key={member.qualifiedId}
                unavailable
                qualifiedId={member.qualifiedId}
                contained={contained}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
