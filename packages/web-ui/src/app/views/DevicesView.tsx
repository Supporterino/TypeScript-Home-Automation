/**
 * The device list view over the unified endpoint — shows source,
 * reachability, and observation freshness (design.md D2; specs/web-ui
 * "Device Tiles", "Hidden Devices Are Filtered By Default And Revealable";
 * task 5.3). Reused for both "all devices" and the "unassigned" entry via the
 * `filter` prop.
 *
 * The reveal and operable-only filters are session-scoped viewing preferences
 * (never persisted, never a device change), and the count beside the title is
 * derived from exactly the list rendered beneath it, so the two never disagree.
 *
 * Rebuilt on the Lumen primitive layer (`ui/*`) and `lucide-react` (task 5.3).
 */
import { LayoutList, PlugZap } from "lucide-react";
import { useState } from "react";
import { DeviceTile } from "../components/DeviceTile.js";
import { isOperableDevice } from "../lib/capability-ranking.js";
import { useDataStore } from "../lib/data-store.js";
import { EmptyState, Grid, Row, Stack, Switch } from "../ui/index.js";

export function DevicesView({ onlyUnassigned = false }: { onlyUnassigned?: boolean }) {
  const { devices, unassignedDevices } = useDataStore();
  const [operableOnly, setOperableOnly] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const list = onlyUnassigned ? unassignedDevices : devices;
  const shown = showHidden ? list : list.filter((d) => !d.hidden);
  const visible = operableOnly ? shown.filter((d) => isOperableDevice(d.capabilities)) : shown;

  const genuinelyEmpty = list.length === 0;
  const filteredEmpty = !genuinelyEmpty && visible.length === 0;
  const allHiddenOnly = filteredEmpty && !showHidden && shown.length === 0;
  const hiddenCount = list.length - shown.length;

  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <Row justify="between" align="center" gap={3} wrap>
          <h2 className="font-display text-2xl font-bold text-ink">
            {onlyUnassigned ? "Unassigned devices" : "All devices"}
          </h2>
          <Row gap={3} align="center" wrap>
            <label className="flex items-center gap-2 text-sm text-muted">
              <Switch
                checked={showHidden}
                onCheckedChange={setShowHidden}
                disabled={genuinelyEmpty}
              />
              Show hidden
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">
              <Switch
                checked={operableOnly}
                onCheckedChange={setOperableOnly}
                disabled={genuinelyEmpty}
              />
              Operable only
            </label>
          </Row>
        </Row>

        {!genuinelyEmpty && (
          <p className="text-sm text-muted">
            Showing {visible.length} {visible.length === 1 ? "device" : "devices"}
            {!showHidden && hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}
          </p>
        )}
      </Stack>

      {genuinelyEmpty && (
        <EmptyState
          icon={onlyUnassigned ? <LayoutList size={28} /> : <PlugZap size={28} />}
          title={onlyUnassigned ? "Every device is assigned" : "No devices known yet"}
          description={
            onlyUnassigned
              ? "Devices appear here when they no longer belong to a room."
              : "Devices appear here once a source reports them."
          }
        />
      )}

      {filteredEmpty &&
        (allHiddenOnly ? (
          <p className="text-sm text-muted">
            Every device is hidden — turn on "Show hidden" to see them.
          </p>
        ) : (
          <p className="text-sm text-muted">
            No operable devices. Every known device only reports — turn off "Operable only" to see
            them.
          </p>
        ))}

      {visible.length > 0 && (
        <Grid columns={2} md={3} lg={5} gap={3}>
          {visible.map((device) => (
            <DeviceTile key={device.qualifiedId} device={device} />
          ))}
        </Grid>
      )}
    </Stack>
  );
}
