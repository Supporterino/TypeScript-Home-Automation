import {
  Badge,
  Box,
  Group,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconActivity,
  IconClock,
  IconDatabase,
  IconPlugConnected,
  IconRobot,
  IconTimezone,
} from "@tabler/icons-react";
import type { DashboardData, LogEntry } from "../types.js";
import {
  entryKey,
  extraFields,
  formatDateTime,
  formatTime,
  LEVEL_NAMES,
  levelColor,
  levelCssColor,
} from "../utils/logUtils.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// ── Stat card ─────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function StatCard({ label, icon, children }: StatCardProps) {
  return (
    <Paper withBorder p="md" radius="md">
      <Group gap="xs" mb={6} align="center">
        <Box c="dimmed">{icon}</Box>
        <Text size="xs" tt="uppercase" fw={600} c="dimmed">
          {label}
        </Text>
      </Group>
      {children}
    </Paper>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────

interface Props {
  data: DashboardData | null;
}

export function OverviewTab({ data }: Props) {
  const status = data?.status ?? null;
  const automations = data?.automations ?? [];
  const state = data?.state ?? {};
  const recentLogs = (data?.logs ?? []).slice(-10).reverse();

  const engineReady = status?.status === "ready";
  const mqttConnected = status?.checks?.mqtt === true;
  const uptime = status?.startedAt != null ? formatUptime(Date.now() - status.startedAt) : "—";

  return (
    <Stack gap="md">
      <Title order={2}>Overview</Title>

      <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="md">
        <StatCard label="Engine" icon={<IconActivity size={14} />}>
          <Badge color={engineReady ? "green" : "red"} size="lg" variant="light">
            {engineReady ? "Ready" : "Not Ready"}
          </Badge>
        </StatCard>

        <StatCard label="MQTT" icon={<IconPlugConnected size={14} />}>
          <Badge color={mqttConnected ? "green" : "red"} size="lg" variant="light">
            {mqttConnected ? "Connected" : "Disconnected"}
          </Badge>
        </StatCard>

        <StatCard label="Uptime" icon={<IconClock size={14} />}>
          <Text fw={700} size="lg" ff="monospace">
            {uptime}
          </Text>
        </StatCard>

        <StatCard label="Timezone" icon={<IconTimezone size={14} />}>
          <Text fw={700} size="lg" c="blue">
            {status?.tz ?? "—"}
          </Text>
        </StatCard>

        <StatCard label="Automations" icon={<IconRobot size={14} />}>
          <Text fw={700} size="lg" c="blue">
            {automations.length}
          </Text>
        </StatCard>

        <StatCard label="State Keys" icon={<IconDatabase size={14} />}>
          <Text fw={700} size="lg" c="teal">
            {Object.keys(state).length}
          </Text>
        </StatCard>
      </SimpleGrid>

      {/* Recent logs feed */}
      <Paper withBorder p="md" radius="md">
        <Text size="xs" tt="uppercase" fw={600} c="dimmed" mb="sm">
          Recent Logs
        </Text>
        <ScrollArea h={280} type="auto" scrollbars="y">
          {recentLogs.length === 0 ? (
            <Text c="dimmed" size="sm" ta="center" py="xl">
              No log entries yet
            </Text>
          ) : (
            <Stack gap={2}>
              {recentLogs.map((entry) => (
                <MiniLogEntry key={entryKey(entry)} entry={entry} />
              ))}
            </Stack>
          )}
        </ScrollArea>
      </Paper>
    </Stack>
  );
}

// ── Mini log entry (compact, non-expandable) ──────────────────────────────

function MiniLogEntry({ entry }: { entry: LogEntry }) {
  const levelName = LEVEL_NAMES[entry.level] ?? String(entry.level);
  const color = levelColor(entry.level);
  const borderColor = levelCssColor(entry.level);
  const source = entry.automation ?? (entry as { service?: string }).service ?? "";
  const hasExtras = extraFields(entry).length > 0;

  return (
    <Box
      style={{ borderLeft: `3px solid ${borderColor}`, borderRadius: "0 4px 4px 0" }}
      bg="var(--mantine-color-default-hover)"
      px="sm"
      py={3}
    >
      <Group gap="xs" wrap="nowrap" align="center">
        <Tooltip label={formatDateTime(entry.time)} openDelay={400}>
          <Text
            size="xs"
            c="dimmed"
            ff="monospace"
            style={{ whiteSpace: "nowrap", flexShrink: 0, minWidth: 68 }}
          >
            {formatTime(entry.time)}
          </Text>
        </Tooltip>

        <Badge color={color} size="xs" variant="light" style={{ flexShrink: 0, minWidth: 46 }}>
          {levelName}
        </Badge>

        {source && (
          <Text
            size="xs"
            c="blue"
            ff="monospace"
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flexShrink: 0,
              maxWidth: 120,
            }}
          >
            {source}
          </Text>
        )}

        <Text
          size="xs"
          ff="monospace"
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.msg}
        </Text>

        {hasExtras && (
          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
            +
          </Text>
        )}
      </Group>
    </Box>
  );
}
