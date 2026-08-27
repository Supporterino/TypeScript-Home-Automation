import { Stack, Text, Title } from "@mantine/core";
import { dashboardPath } from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";

export function NotFoundView() {
  const { basePath } = useRouter();
  return (
    <Stack align="center" justify="center" mih={300} gap="xs">
      <Title order={3}>Not found</Title>
      <Text c="dimmed" size="sm">
        Nothing is registered at this path.
      </Text>
      <Link to={dashboardPath(basePath)}>Back to dashboard</Link>
    </Stack>
  );
}
