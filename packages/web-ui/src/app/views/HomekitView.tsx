/**
 * The operator HomeKit view — bridge status, pairing information, and the
 * accessories currently bridged, reading the same `/api/homekit/status`
 * endpoint as before (design.md D12; specs/web-ui "Operator Views"; task 6.2).
 *
 * Where `HomekitService` is not registered the store's `homekit` is `null` and
 * the view reports the feature as unconfigured rather than as an empty bridge.
 *
 * Rebuilt on the Lumen primitive layer (`ui/*`) and `lucide-react`.
 */
import { CircleCheck, CircleX, HousePlug } from "lucide-react";
import type { ReactNode } from "react";
import { useDataStore } from "../lib/data-store.js";
import { Badge, Card, Grid, Row, Stack, Stat } from "../ui/index.js";

/** Bridge availability is encoded by icon + word + tone, never colour alone. */
function StatusValue({ running }: { running: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {running ? (
        <CircleCheck size={14} aria-hidden className="text-on" />
      ) : (
        <CircleX size={14} aria-hidden className="text-danger" />
      )}
      {running ? "Running" : "Stopped"}
    </span>
  );
}

/** A label/value pair within the pairing-information card. */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Row gap={2} align="baseline" wrap>
      <span className="w-32 shrink-0 text-sm text-muted">{label}</span>
      <span className="min-w-0 text-sm text-ink">{children}</span>
    </Row>
  );
}

export function HomekitView() {
  const { homekit } = useDataStore();

  return (
    <Stack gap={4}>
      <h2 className="font-display text-2xl font-bold text-ink">HomeKit</h2>

      {!homekit ? (
        <Card>
          <Stack gap={2}>
            <Row gap={2} align="center">
              <HousePlug size={18} aria-hidden className="text-accent" />
              <span className="font-semibold text-ink">HomeKit bridge not configured</span>
            </Row>
            <p className="max-w-prose text-sm text-muted">
              Register a{" "}
              <code className="rounded-input border border-hairline bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink">
                HomekitService
              </code>{" "}
              in your engine's services map to expose devices to Apple Home.
            </p>
          </Stack>
        </Card>
      ) : (
        <>
          <Grid columns={2} md={4} gap={3}>
            <Card>
              <Stat label="Bridge" value={<StatusValue running={homekit.running} />} />
            </Card>
            <Card>
              <Stat label="Accessories" value={homekit.accessoryCount} tone="info" />
            </Card>
            <Card>
              <Stat label="HAP port" value={<span className="font-mono">{homekit.port}</span>} />
            </Card>
            <Card>
              <Stat
                label="Publication"
                value={homekit.running ? "Published" : "Offline"}
                tone={homekit.running ? "on" : "danger"}
              />
            </Card>
          </Grid>

          <Card>
            <Stack gap={2}>
              <span className="text-xs font-bold uppercase tracking-wide text-muted">
                Bridge configuration (pairing information)
              </span>
              <DetailRow label="Bridge name">{homekit.bridgeName}</DetailRow>
              <DetailRow label="MAC (username)">
                <code className="font-mono text-xs">{homekit.username}</code>
              </DetailRow>
              <DetailRow label="Persist path">
                <code className="break-all font-mono text-xs">{homekit.persistPath}</code>
              </DetailRow>
              {homekit.bind && (
                <DetailRow label="Advertised on">
                  <code className="font-mono text-xs">
                    {Array.isArray(homekit.bind) ? homekit.bind.join(", ") : homekit.bind}
                  </code>
                </DetailRow>
              )}
              <Row gap={2} align="center">
                <Badge tone={homekit.running ? "on" : "danger"}>
                  {homekit.running ? (
                    <CircleCheck size={12} aria-hidden />
                  ) : (
                    <CircleX size={12} aria-hidden />
                  )}
                  {homekit.accessoryCount}{" "}
                  {homekit.accessoryCount === 1 ? "accessory" : "accessories"}
                </Badge>
              </Row>
            </Stack>
          </Card>
        </>
      )}
    </Stack>
  );
}
