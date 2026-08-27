/**
 * The operator HomeKit view — bridge status, pairing information, and
 * bridged accessories, reading the same `/api/homekit/status` endpoint as
 * before (design.md D25; specs/web-ui "Operator Views"; task 10.22).
 * Reports the service as unconfigured rather than erroring or showing an
 * empty bridge when it is not registered.
 */
import { Alert, Badge, Code, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconHome } from "@tabler/icons-react";
import { useDataStore } from "../lib/data-store.js";

export function HomekitView() {
  const { homekit } = useDataStore();

  return (
    <Stack gap="md">
      <Title order={2}>HomeKit</Title>

      {!homekit ? (
        <Alert color="blue" title="HomeKit bridge not configured" icon={<IconHome size={16} />}>
          Register a <Code>HomekitService</Code> in your engine's services map to expose devices to
          Apple Home.
        </Alert>
      ) : (
        <>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
            <Paper withBorder p="md" radius="md">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={6}>
                Bridge
              </Text>
              <Badge color={homekit.running ? "green" : "red"} variant="light" size="lg">
                {homekit.running ? "Running" : "Stopped"}
              </Badge>
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={6}>
                Accessories
              </Text>
              <Text fw={700} size="lg" c="blue">
                {homekit.accessoryCount}
              </Text>
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={6}>
                HAP port
              </Text>
              <Text fw={700} size="lg" ff="monospace">
                {homekit.port}
              </Text>
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={6}>
                Status
              </Text>
              <Badge color={homekit.running ? "teal" : "gray"} variant="light" size="lg">
                {homekit.running ? "Published" : "Offline"}
              </Badge>
            </Paper>
          </SimpleGrid>

          <Paper withBorder p="md" radius="md">
            <Text size="xs" tt="uppercase" fw={600} c="dimmed" mb="sm">
              Bridge configuration (pairing information)
            </Text>
            <Stack gap={6}>
              <Group gap="xs">
                <Text size="sm" c="dimmed" w={120}>
                  Bridge name
                </Text>
                <Text size="sm" fw={500}>
                  {homekit.bridgeName}
                </Text>
              </Group>
              <Group gap="xs">
                <Text size="sm" c="dimmed" w={120}>
                  MAC (username)
                </Text>
                <Code fz="sm">{homekit.username}</Code>
              </Group>
              <Group gap="xs">
                <Text size="sm" c="dimmed" w={120}>
                  Persist path
                </Text>
                <Code fz="sm">{homekit.persistPath}</Code>
              </Group>
              {homekit.bind && (
                <Group gap="xs">
                  <Text size="sm" c="dimmed" w={120}>
                    Advertised on
                  </Text>
                  <Code fz="sm">
                    {Array.isArray(homekit.bind) ? homekit.bind.join(", ") : homekit.bind}
                  </Code>
                </Group>
              )}
            </Stack>
          </Paper>
        </>
      )}
    </Stack>
  );
}
