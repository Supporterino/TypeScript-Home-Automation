/**
 * The landing view: a device control surface, not engine status (design.md
 * D13; specs/web-ui "Navigation and Information Architecture"; task 10.7).
 * Engine readiness is demoted to a small status badge here.
 */
import { Badge, Group, SimpleGrid, Stack, Switch, Text, Title } from "@mantine/core";
import { useState } from "react";
import { DeviceTile } from "../components/DeviceTile.js";
import { isOperableDevice } from "../lib/capability-ranking.js";
import { useDataStore } from "../lib/data-store.js";
import type { DeviceDescriptor } from "../types.js";

/** Session-scoped filter (design.md D5): plain component state, reset on reload. */
function operable(devices: DeviceDescriptor[], operableOnly: boolean): DeviceDescriptor[] {
  return operableOnly ? devices.filter((d) => isOperableDevice(d.capabilities)) : devices;
}

/** Hidden devices are filtered out unless revealed (design.md D12; specs/web-ui). */
function reveal(devices: DeviceDescriptor[], showHidden: boolean): DeviceDescriptor[] {
  return showHidden ? devices : devices.filter((d) => !d.hidden);
}

export function DashboardView() {
  const { status, rooms, unassignedDevices } = useDataStore();
  const [operableOnly, setOperableOnly] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const ready = status?.status === "ready";

  const roomSections = rooms
    .map((room) => ({
      room,
      // biome-ignore lint/style/noNonNullAssertion: filtered below
      allMembers: room.members.filter((m) => m.available && m.device).map((m) => m.device!),
    }))
    .filter(({ allMembers }) => allMembers.length > 0)
    .map(({ room, allMembers }) => {
      const shownMembers = reveal(allMembers, showHidden);
      return {
        room,
        allHidden: shownMembers.length === 0,
        visibleMembers: operable(shownMembers, operableOnly),
      };
    });

  const shownUnassigned = reveal(unassignedDevices, showHidden);
  const visibleUnassigned = operable(shownUnassigned, operableOnly);

  const totalDevices =
    rooms.reduce((n, r) => n + r.members.filter((m) => m.available).length, 0) +
    unassignedDevices.length;
  const genuinelyEmpty = rooms.length === 0 && unassignedDevices.length === 0;
  const filteredEmpty =
    !genuinelyEmpty &&
    roomSections.every((s) => s.visibleMembers.length === 0) &&
    visibleUnassigned.length === 0;
  const allHiddenOnly =
    filteredEmpty &&
    !showHidden &&
    roomSections.every((s) => s.allHidden) &&
    shownUnassigned.length === 0;

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>Dashboard</Title>
        <Group gap="md">
          <Switch
            label="Show hidden"
            size="sm"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.currentTarget.checked)}
            disabled={totalDevices === 0}
          />
          <Switch
            label="Operable only"
            size="sm"
            checked={operableOnly}
            onChange={(e) => setOperableOnly(e.currentTarget.checked)}
            disabled={totalDevices === 0}
          />
          <Badge color={ready ? "green" : "red"} variant="light" size="sm">
            {ready ? "Engine ready" : "Engine not ready"}
          </Badge>
        </Group>
      </Group>

      {genuinelyEmpty && (
        <Text c="dimmed" size="sm">
          No devices yet. Devices appear here once a source (Zigbee, Shelly, Nanoleaf, or a state
          toggle) reports them.
        </Text>
      )}

      {filteredEmpty &&
        (allHiddenOnly ? (
          <Text c="dimmed" size="sm">
            Every device is hidden — turn on "Show hidden" to see them.
          </Text>
        ) : (
          <Text c="dimmed" size="sm">
            No operable devices. Every known device only reports — turn off "Operable only" to see
            them.
          </Text>
        ))}

      {roomSections.map(({ room, visibleMembers, allHidden }) => {
        if (visibleMembers.length === 0) {
          if (!allHidden || showHidden) return null;
          return (
            <Stack key={room.id} gap="xs">
              <Text fw={600} size="sm" c="dimmed" tt="uppercase">
                {room.name}
              </Text>
              <Text c="dimmed" size="xs">
                All devices in this room are hidden.
              </Text>
            </Stack>
          );
        }
        return (
          <Stack key={room.id} gap="xs">
            <Text fw={600} size="sm" c="dimmed" tt="uppercase">
              {room.name}
            </Text>
            <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="sm">
              {visibleMembers.map((device) => (
                <DeviceTile key={device.qualifiedId} device={device} />
              ))}
            </SimpleGrid>
          </Stack>
        );
      })}

      {visibleUnassigned.length > 0 && (
        <Stack gap="xs">
          <Text fw={600} size="sm" c="dimmed" tt="uppercase">
            Unassigned
          </Text>
          <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="sm">
            {visibleUnassigned.map((device) => (
              <DeviceTile key={device.qualifiedId} device={device} />
            ))}
          </SimpleGrid>
        </Stack>
      )}
    </Stack>
  );
}
