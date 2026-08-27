import { Button, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Contains a render failure so it does not take down the whole dashboard.
 *
 * Placed structurally at the single point where view content is swapped —
 * today the tab content area in `App.tsx`, to be relocated to the route
 * outlet once 10.1 introduces the router — never per view, so there is one
 * place for it to be wrong (design.md R16).
 *
 * Recovery on navigating away and back is achieved by the caller remounting
 * this component (e.g. keying it by the active view) rather than by any
 * internal retry logic here — a fresh mount clears `state.error` for free.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] Render failure contained:", error, info.componentStack);
  }

  private readonly reset = () => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <Stack align="center" justify="center" gap="sm" p="xl" mih={200}>
          <IconAlertTriangle size={32} color="var(--mantine-color-red-6)" />
          <Title order={4}>Something went wrong rendering this view</Title>
          <Text size="sm" c="dimmed" ta="center" maw={480}>
            {this.state.error.message || "An unexpected error occurred."}
          </Text>
          <Text size="xs" c="dimmed" ta="center">
            The rest of the dashboard is unaffected. Navigate to another view and back to retry.
          </Text>
          <Button size="xs" variant="light" onClick={this.reset}>
            Retry
          </Button>
        </Stack>
      );
    }

    return this.props.children;
  }
}
