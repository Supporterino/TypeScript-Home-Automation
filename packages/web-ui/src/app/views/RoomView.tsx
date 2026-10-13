/**
 * A single room's detail and control view — assign, unassign, filters, and the
 * room-level command (design.md D14, D6, D7; specs/web-ui "Room Management
 * Interface", "Room-Level Command"; task 5.2).
 *
 * Members are presented in the same grid every other device collection uses,
 * through the same {@link DeviceTile} component — an unavailable member renders
 * through its unavailable variant rather than a parallel layout, and never
 * shows its stale state as current. Removing a member is not always-present
 * chrome: it lives behind a room-level manage mode, reachable by keyboard or
 * tap so it works on the PWA's primary input.
 *
 * Room creation/rename/delete live on the rooms index; this view owns
 * membership and the batch command. Rebuilt on the Lumen primitive layer
 * (`ui/*`) and `lucide-react` (task 5.2).
 */
import { Check, CircleHelp, ListChecks, Plus, Power, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { assignDeviceRoom, sendRoomCommand, unassignDeviceRoom } from "../api.js";
import { DeviceTile } from "../components/DeviceTile.js";
import { isOperableDevice } from "../lib/capability-ranking.js";
import { useDataStore } from "../lib/data-store.js";
import { humanizeDeviceName } from "../lib/humanize-name.js";
import {
  classifyRoomCommandResults,
  groupOnOffCommand,
  mergeRoomCommandResults,
  supportsOnOffCommand,
} from "../lib/room-command.js";
import { roomsPath } from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";
import {
  Badge,
  Button,
  EmptyState,
  Grid,
  IconButton,
  Row,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Stack,
  Switch,
} from "../ui/index.js";

export function RoomView({ roomId }: { roomId: string }) {
  const { rooms, unassignedDevices, refresh, applyOptimisticOverride, revertOptimisticOverride } =
    useDataStore();
  const { basePath } = useRouter();
  const room = rooms.find((r) => r.id === roomId);

  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Local, discarded on navigation — nothing about edit mode is worth
  // persisting (design.md D7).
  const [editMode, setEditMode] = useState(false);
  // Session-scoped filter (design.md D5), same predicate as every other
  // device collection (design.md D4).
  const [operableOnly, setOperableOnly] = useState(false);
  // Session-scoped reveal (design.md D12): a viewing preference, never a
  // change to any device's hidden flag — resets on reload.
  const [showHidden, setShowHidden] = useState(false);
  // Room-command outcome, surfaced per task 10.2/10.3.
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [skippedCount, setSkippedCount] = useState(0);

  if (!room) {
    return (
      <EmptyState
        icon={<TriangleAlert size={28} />}
        title="Room not found"
        description="This room no longer exists. It may have just been deleted."
        action={
          <Button variant="soft" size="sm" asChild>
            <Link to={roomsPath(basePath)}>Back to rooms</Link>
          </Button>
        }
      />
    );
  }

  async function handleAssign() {
    if (!assignTarget) return;
    setBusy(true);
    setError(null);
    try {
      await assignDeviceRoom(assignTarget, room!.id);
      setAssignTarget(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign device");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign(qualifiedId: string) {
    setBusy(true);
    setError(null);
    try {
      await unassignDeviceRoom(qualifiedId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove device from room");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Issues the room batch command (design.md D5; specs/web-ui "Room-Level
   * Command"; task 10.1). Members are grouped by the on/off property they
   * declare — one request per distinct family, since the endpoint rejects a
   * property a member does not declare, so a single `{ on }` body could never
   * address a Zigbee `state` light. A homogeneous room still issues exactly
   * one request. Every actuatable member is reflected optimistically through
   * the store-level override layer — so every mounted tile updates, not just
   * this view — using the value actually sent for its family, then the
   * per-member responses are merged: `applied` is left to the stream or the
   * override deadline, `failed` reverts and is surfaced as an error, and
   * `skipped` is reported separately as an informational count (tasks 10.2,
   * 10.3).
   */
  async function handleRoomCommand(on: boolean) {
    const capableMembers = room!.members
      .filter((m) => m.available && m.device)
      // biome-ignore lint/style/noNonNullAssertion: filtered above
      .map((m) => ({ qualifiedId: m.qualifiedId, capabilities: m.device!.capabilities }))
      .filter((m) => supportsOnOffCommand(m.capabilities));

    // Nothing to command: do not issue a pointless request.
    if (capableMembers.length === 0) return;

    setCommandBusy(true);
    setCommandError(null);
    setSkippedCount(0);

    const groups = groupOnOffCommand(capableMembers, on);
    // biome-ignore lint/style/noNonNullAssertion: members are filtered available above
    const deviceByMember = new Map(
      room!.members.filter((m) => m.available && m.device).map((m) => [m.qualifiedId, m.device!]),
    );

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
    const overrideByMember = new Map(overrides.map((o) => [o.qualifiedId, o]));

    try {
      const responses = await Promise.all(
        groups.map((group) => sendRoomCommand(room!.id, { [group.property]: group.value })),
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
      // The request itself failed: no member's outcome is known, so revert
      // every optimistic override and surface the failure.
      for (const { qualifiedId, property, token } of overrides) {
        revertOptimisticOverride(qualifiedId, property, token);
      }
      setCommandError(err instanceof Error ? err.message : "Room command failed");
    } finally {
      setCommandBusy(false);
    }
  }

  const allAvailableMembers = room.members.filter((m) => m.available && m.device);
  const unavailableMembers = room.members.filter((m) => !m.available);
  // biome-ignore lint/style/noNonNullAssertion: filtered above
  const shownMembers = showHidden
    ? allAvailableMembers
    : allAvailableMembers.filter((m) => !m.device!.hidden);
  const availableMembers = operableOnly
    ? // biome-ignore lint/style/noNonNullAssertion: filtered above
      shownMembers.filter((m) => isOperableDevice(m.device!.capabilities))
    : shownMembers;

  const genuinelyEmpty = allAvailableMembers.length === 0 && unavailableMembers.length === 0;
  const actuatableMembers = allAvailableMembers.filter((m) =>
    // biome-ignore lint/style/noNonNullAssertion: filtered above
    supportsOnOffCommand(m.device!.capabilities),
  );
  const filteredEmpty =
    !genuinelyEmpty && availableMembers.length === 0 && unavailableMembers.length === 0;
  const allHiddenOnly =
    filteredEmpty && !showHidden && allAvailableMembers.length > 0 && shownMembers.length === 0;

  return (
    <Stack gap={4}>
      <Row justify="between" align="center" gap={3} wrap>
        <h2 className="font-display text-2xl font-bold text-ink">{room.name}</h2>
        <IconButton
          label={editMode ? "Done managing members" : "Manage members"}
          variant={editMode ? "solid" : "ghost"}
          aria-pressed={editMode}
          onClick={() => setEditMode((value) => !value)}
        >
          {editMode ? <Check size={16} /> : <ListChecks size={16} />}
        </IconButton>
      </Row>

      <Row gap={2} align="end" wrap>
        <Stack gap={1} className="min-w-[240px] flex-1">
          <span className="text-xs font-medium text-muted">Assign a device to this room</span>
          <Select
            value={assignTarget ?? ""}
            onValueChange={(value) => setAssignTarget(value)}
            disabled={unassignedDevices.length === 0}
          >
            <SelectTrigger aria-label="Assign a device to this room">
              <SelectValue placeholder="Choose a device" />
            </SelectTrigger>
            <SelectContent>
              {unassignedDevices.map((d) => (
                <SelectItem key={d.qualifiedId} value={d.qualifiedId}>
                  {humanizeDeviceName(d.displayName)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Stack>
        <Button onClick={() => void handleAssign()} disabled={!assignTarget || busy}>
          {busy ? <Spinner size={14} label="" /> : <Plus size={14} aria-hidden />}
          Add
        </Button>
      </Row>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {actuatableMembers.length > 0 && (
        <Row gap={2} align="center" wrap>
          <span className="text-sm text-muted">Room control</span>
          <Button
            size="sm"
            variant="soft"
            disabled={commandBusy}
            onClick={() => void handleRoomCommand(true)}
          >
            {commandBusy ? <Spinner size={14} label="" /> : <Power size={14} aria-hidden />}
            All on
          </Button>
          <Button
            size="sm"
            variant="soft"
            disabled={commandBusy}
            onClick={() => void handleRoomCommand(false)}
          >
            {commandBusy ? <Spinner size={14} label="" /> : <Power size={14} aria-hidden />}
            All off
          </Button>
        </Row>
      )}

      {commandError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-input border border-danger/30 bg-danger/15 px-3 py-2 text-sm text-danger"
        >
          <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold">Room command failed. </strong>
            {commandError}
          </span>
        </div>
      )}

      {skippedCount > 0 && (
        <Badge tone="neutral" className="w-fit">
          <CircleHelp size={12} aria-hidden />
          {skippedCount} skipped (no control)
        </Badge>
      )}

      {genuinelyEmpty && <p className="text-sm text-muted">No devices in this room yet.</p>}

      {!genuinelyEmpty && (
        <Row justify="end" gap={3} wrap>
          <label className="flex items-center gap-2 text-sm text-muted">
            <Switch checked={showHidden} onCheckedChange={setShowHidden} />
            Show hidden
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <Switch checked={operableOnly} onCheckedChange={setOperableOnly} />
            Operable only
          </label>
        </Row>
      )}

      {filteredEmpty &&
        (allHiddenOnly ? (
          <p className="text-sm text-muted">
            This room's devices are hidden, not absent — turn on "Show hidden" to see them.
          </p>
        ) : (
          <p className="text-sm text-muted">
            No operable devices. Every device in this room only reports — turn off "Operable only"
            to see them.
          </p>
        ))}

      {(availableMembers.length > 0 || unavailableMembers.length > 0) && (
        <Grid columns={2} md={3} lg={5} gap={3}>
          {availableMembers.map((member) => (
            <DeviceTile
              key={member.qualifiedId}
              // biome-ignore lint/style/noNonNullAssertion: filtered above
              device={member.device!}
              action={
                editMode ? (
                  <IconButton
                    label="Remove from room"
                    size="sm"
                    onClick={() => void handleUnassign(member.qualifiedId)}
                  >
                    <X size={14} />
                  </IconButton>
                ) : undefined
              }
            />
          ))}

          {unavailableMembers.map((member) => (
            <DeviceTile
              key={member.qualifiedId}
              unavailable
              qualifiedId={member.qualifiedId}
              action={
                editMode ? (
                  <IconButton
                    label="Remove from room"
                    size="sm"
                    onClick={() => void handleUnassign(member.qualifiedId)}
                  >
                    <X size={14} />
                  </IconButton>
                ) : undefined
              }
            />
          ))}
        </Grid>
      )}
    </Stack>
  );
}
