import { TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Stack } from "../ui/index.js";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Contains a render failure so it does not take down the whole dashboard.
 *
 * Placed structurally at the single point where view content is swapped — the
 * route outlet in `App.tsx` — never per view, so there is one place for it to
 * be wrong.
 *
 * Recovery on navigating away and back is achieved by the caller remounting
 * this component (keying it by the active view) rather than by any internal
 * retry logic here — a fresh mount clears `state.error` for free. The Retry
 * button re-renders the same children without a navigation.
 *
 * Rebuilt on the Lumen primitive layer (`ui/*`); its view-failure isolation and
 * recovery-on-navigation contract are preserved (task 4.3).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] Render failure contained:", error, info.componentStack);
  }

  private readonly reset = () => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <Stack
          align="center"
          gap={3}
          className="justify-center px-6 py-10 text-center"
          style={{ minHeight: 200 }}
        >
          <TriangleAlert size={32} className="text-danger" aria-hidden />
          <p className="text-lg font-semibold text-ink">Something went wrong rendering this view</p>
          <p className="max-w-prose text-sm text-muted">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <p className="text-xs text-muted">
            The rest of the dashboard is unaffected. Navigate to another view and back to retry.
          </p>
          <Button size="sm" variant="soft" onClick={this.reset}>
            Retry
          </Button>
        </Stack>
      );
    }

    return this.props.children;
  }
}
