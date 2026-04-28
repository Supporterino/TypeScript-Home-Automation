import {
  Alert,
  Badge,
  Code,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconDevices,
  IconHome,
  IconNetwork,
  IconPlugConnected,
  IconServer,
} from "@tabler/icons-react";
import type { DashboardData, HomekitStatus } from "../types.js";

// ── Stat card (reuses the same visual pattern as OverviewTab) ─────────────

interface StatCardProps {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function StatCard({ label, icon, children }: StatCardProps) {
  return (
    <Paper withBorder p="md" radius="md">
      <Group gap="xs" mb={6} align="center">
        <Text c="dimmed" style={{ display: "flex" }}>
          {icon}
        </Text>
        <Text size="xs" tt="uppercase" fw={600} c="dimmed">
          {label}
        </Text>
      </Group>
      {children}
    </Paper>
  );
}

// ── Bridge detail section ─────────────────────────────────────────────────

function BridgeDetails({ status }: { status: HomekitStatus }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="xs" tt="uppercase" fw={600} c="dimmed" mb="sm">
        Bridge Configuration
      </Text>
      <Stack gap={6}>
        <Group gap="xs">
          <Text size="sm" c="dimmed" w={120}>
            Bridge name
          </Text>
          <Text size="sm" fw={500}>
            {status.bridgeName}
          </Text>
        </Group>
        <Group gap="xs">
          <Text size="sm" c="dimmed" w={120}>
            HAP port
          </Text>
          <Code fz="sm">{status.port}</Code>
        </Group>
        <Group gap="xs">
          <Text size="sm" c="dimmed" w={120}>
            MAC (username)
          </Text>
          <Code fz="sm">{status.username}</Code>
        </Group>
        <Group gap="xs">
          <Text size="sm" c="dimmed" w={120}>
            Pairing PIN
          </Text>
          <Code fz="sm">{status.pinCode}</Code>
        </Group>
        <Group gap="xs">
          <Text size="sm" c="dimmed" w={120}>
            Persist path
          </Text>
          <Code fz="sm">{status.persistPath}</Code>
        </Group>
      </Stack>
    </Paper>
  );
}

// ── Not configured banner ─────────────────────────────────────────────────

function NotConfigured() {
  return (
    <Alert color="gray" title="HomeKit bridge not configured" icon={<IconHome size={16} />}>
      Register a <Code fz="sm">HomekitService</Code> in your engine's <Code fz="sm">services</Code>{" "}
      map to expose your Zigbee devices to Apple Home.
    </Alert>
  );
}

// ── HomekitTab ────────────────────────────────────────────────────────────

interface Props {
  data: DashboardData | null;
}

export function HomekitTab({ data }: Props) {
  const status = data?.homekit ?? null;

  return (
    <Stack gap="md">
      <Group gap="sm" align="center">
        <ThemeIcon variant="light" color="blue" size="lg" radius="md">
          <IconHome size={18} />
        </ThemeIcon>
        <Title order={2}>HomeKit</Title>
      </Group>

      {!status ? (
        <NotConfigured />
      ) : (
        <>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
            <StatCard label="Bridge" icon={<IconServer size={14} />}>
              <Badge color={status.running ? "green" : "red"} size="lg" variant="light">
                {status.running ? "Running" : "Stopped"}
              </Badge>
            </StatCard>

            <StatCard label="Accessories" icon={<IconDevices size={14} />}>
              <Text fw={700} size="lg" c="blue">
                {status.accessoryCount}
              </Text>
            </StatCard>

            <StatCard label="HAP Port" icon={<IconNetwork size={14} />}>
              <Text fw={700} size="lg" ff="monospace">
                {status.port}
              </Text>
            </StatCard>

            <StatCard label="Status" icon={<IconPlugConnected size={14} />}>
              <Badge color={status.running ? "teal" : "gray"} size="lg" variant="light">
                {status.running ? "Paired & Live" : "Offline"}
              </Badge>
            </StatCard>
          </SimpleGrid>

          <BridgeDetails status={status} />
        </>
      )}
    </Stack>
  );
}
