import { Accordion, Alert, Badge, Code, Group, Stack, Table, Text, Title } from "@mantine/core";
import type { DashboardData, DeviceInfo } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────

function interviewBadgeColor(state: string): string {
  if (state === "SUCCESSFUL") return "green";
  if (state === "FAILED") return "red";
  if (state === "IN_PROGRESS") return "orange";
  return "gray";
}

function typeBadgeColor(type: string): string {
  if (type === "Router") return "blue";
  if (type === "EndDevice") return "teal";
  return "gray";
}

function formatStateValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const json = JSON.stringify(value);
  return json.length <= 60 ? json : `${json.slice(0, 57)}...`;
}

// ── Device accordion control label ────────────────────────────────────────

function DeviceControlLabel({ device }: { device: DeviceInfo }) {
  const stateCount = device.state ? Object.keys(device.state).length : 0;

  return (
    <Group gap="sm" wrap="nowrap">
      <Text fw={600} size="sm" style={{ flex: 1, minWidth: 0 }} truncate>
        {device.nice_name}
      </Text>
      <Badge color={typeBadgeColor(device.type)} variant="light" size="sm">
        {device.type}
      </Badge>
      <Badge color={interviewBadgeColor(device.interview_state)} variant="light" size="sm">
        {device.interview_state}
      </Badge>
      <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
        {stateCount} {stateCount === 1 ? "key" : "keys"}
      </Text>
    </Group>
  );
}

// ── Device detail panel ───────────────────────────────────────────────────

function DevicePanel({ device }: { device: DeviceInfo }) {
  const stateEntries = device.state ? Object.entries(device.state) : [];

  return (
    <Stack gap="md">
      {/* Identity */}
      <Table variant="vertical" withTableBorder layout="fixed">
        <Table.Tbody>
          {device.nice_name !== device.friendly_name && (
            <Table.Tr>
              <Table.Th w={140}>Friendly name</Table.Th>
              <Table.Td>
                <Code fz="xs">{device.friendly_name}</Code>
              </Table.Td>
            </Table.Tr>
          )}
          <Table.Tr>
            <Table.Th w={140}>IEEE address</Table.Th>
            <Table.Td>
              <Code fz="xs">{device.ieee_address}</Code>
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Th>Supported</Table.Th>
            <Table.Td>
              <Badge color={device.supported ? "green" : "gray"} variant="light" size="sm">
                {device.supported ? "Yes" : "No"}
              </Badge>
            </Table.Td>
          </Table.Tr>
          {device.power_source && (
            <Table.Tr>
              <Table.Th>Power source</Table.Th>
              <Table.Td>
                <Text size="sm">{device.power_source}</Text>
              </Table.Td>
            </Table.Tr>
          )}
          {device.definition && (
            <>
              <Table.Tr>
                <Table.Th>Model</Table.Th>
                <Table.Td>
                  <Text size="sm" ff="monospace">
                    {device.definition.model}
                  </Text>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>Vendor</Table.Th>
                <Table.Td>
                  <Text size="sm">{device.definition.vendor}</Text>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>Description</Table.Th>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {device.definition.description}
                  </Text>
                </Table.Td>
              </Table.Tr>
            </>
          )}
        </Table.Tbody>
      </Table>

      {/* State */}
      {stateEntries.length > 0 ? (
        <Stack gap={4}>
          <Text size="xs" tt="uppercase" fw={600} c="dimmed">
            State ({stateEntries.length} {stateEntries.length === 1 ? "key" : "keys"})
          </Text>
          <Table variant="vertical" withTableBorder layout="fixed" fz="xs" ff="monospace">
            <Table.Tbody>
              {stateEntries.map(([key, value]) => (
                <Table.Tr key={key}>
                  <Table.Th w={180} c="dimmed" fw={400}>
                    {key}
                  </Table.Th>
                  <Table.Td fw={500}>{formatStateValue(value)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          No state received yet
        </Text>
      )}
    </Stack>
  );
}

// ── DevicesTab ────────────────────────────────────────────────────────────

interface Props {
  data: DashboardData | null;
}

export function DevicesTab({ data }: Props) {
  const devices = data?.devices ?? [];
  const available = data?.devicesAvailable ?? true;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="baseline">
        <Title order={2}>Devices</Title>
        {available && (
          <Text size="sm" c="dimmed">
            {devices.length} {devices.length === 1 ? "device" : "devices"}
          </Text>
        )}
      </Group>

      {/* Registry disabled */}
      {!available && (
        <Alert color="yellow" title="Device registry disabled" icon="⚠">
          Set{" "}
          <Code fz="sm" c="yellow">
            DEVICE_REGISTRY_ENABLED=true
          </Code>{" "}
          to enable automatic Zigbee2MQTT device discovery and state tracking.
        </Alert>
      )}

      {/* No devices yet */}
      {available && devices.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          No devices tracked yet. Waiting for Zigbee2MQTT to publish the device list.
        </Text>
      )}

      {/* Device list */}
      {available && devices.length > 0 && (
        <Accordion variant="separated" radius="md" chevronPosition="right">
          {devices.map((device) => (
            <Accordion.Item key={device.friendly_name} value={device.friendly_name}>
              <Accordion.Control
                aria-label={`${device.nice_name} — ${device.type} — ${device.interview_state}`}
              >
                <DeviceControlLabel device={device} />
              </Accordion.Control>
              <Accordion.Panel>
                <DevicePanel device={device} />
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}
    </Stack>
  );
}
