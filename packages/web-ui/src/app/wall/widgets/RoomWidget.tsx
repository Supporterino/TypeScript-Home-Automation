/**
 * The wall room widget (design.md D13; specs/wall-display "Widget Catalog", "A
 * room widget commands the room"). Shows a configured room's devices as
 * touch-sized tiles plus room-wide all-on/all-off controls.
 *
 * The batch command reuses the same flow as `RoomView`: capable members are
 * grouped by the on/off property family they declare, every actuatable member
 * is reflected optimistically through the store-level override layer, then
 * the per-member responses are merged and classified — applied is left to the
 * stream or the deadline, failed reverts and is surfaced, skipped is reported
 * separately. Report-only members are never commanded.
 *
 * A control widget: the frame draws the surface, so each contained tile draws
 * none of its own (specs/wall-display "A card is a single surface").
 */
import { Info, Power } from "lucide-react";
import { useState } from "react";
import { sendRoomCommand } from "../../api.js";
import { useDataStore } from "../../lib/data-store.js";
import {
  classifyRoomCommandResults,
  groupOnOffCommand,
  mergeRoomCommandResults,
} from "../../lib/room-command.js";
import type { DeviceDescriptor } from "../../types.js";
import { Badge, Button, Grid, ScrollArea, Spinner, Stack } from "../../ui/index.js";
import type { WallWidgetProps } from "../registry.js";
import { WALL_BODY_FONT_SIZE } from "../type-ramp.js";
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
      <p className="text-muted" style={{ fontSize: WALL_BODY_FONT_SIZE }}>
        {roomId ? `Room "${roomId}" is not configured.` : "No room configured."}
      </p>
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

  return (
    <Stack gap={2} className="h-full min-h-0">
      {hasActuatable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="lg"
            variant="soft"
            disabled={commandBusy}
            onClick={() => void handleRoomCommand(true)}
          >
            {commandBusy ? <Spinner size={18} label="" /> : <Power size={18} aria-hidden />}
            All on
          </Button>
          <Button
            size="lg"
            variant="soft"
            disabled={commandBusy}
            onClick={() => void handleRoomCommand(false)}
          >
            {commandBusy ? <Spinner size={18} label="" /> : <Power size={18} aria-hidden />}
            All off
          </Button>
        </div>
      )}

      {commandError && (
        <p role="alert" className="text-danger" style={{ fontSize: WALL_BODY_FONT_SIZE }}>
          {commandError}
        </p>
      )}

      {skippedCount > 0 && (
        <Badge tone="neutral">
          <Info size={12} aria-hidden />
          {skippedCount} skipped (no control)
        </Badge>
      )}

      {availableMembers.length === 0 && unavailableMembers.length === 0 ? (
        <p className="text-muted" style={{ fontSize: WALL_BODY_FONT_SIZE }}>
          No devices in this room yet.
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <Grid columns={1} md={2} gap={2} className="pr-2">
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
          </Grid>
        </ScrollArea>
      )}
    </Stack>
  );
}
