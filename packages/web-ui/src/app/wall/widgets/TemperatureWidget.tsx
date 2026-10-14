/**
 * The wall temperature widget (design.md D11, D13; specs/wall-display "Widget
 * Catalog", "Touch Operation"). A readout — not a control — presenting the
 * configured sensor device's temperature on the wall's metric ramp, chrome-less
 * on the panel.
 *
 * A device that is not (or is no longer) known, or that reports no temperature,
 * renders a contained explanation inside the widget's own area rather than a
 * throw that would take down the profile; the rest of the profile still renders.
 * Every wall token is Hearth's own (design.md D1, D2) — never a Lumen alias.
 */
import { Thermometer } from "lucide-react";
import { formatReadoutValue } from "../../components/CapabilityControl.js";
import { useDataStore } from "../../lib/data-store.js";
import { humanizeDeviceName } from "../../lib/humanize-name.js";
import type { WallWidgetProps } from "../registry.js";
import { WALL_BODY_FONT_SIZE, WALL_LABEL_FONT_SIZE, WALL_METRIC_FONT_SIZE } from "../type-ramp.js";
import { temperatureWidgetState } from "./temperature-model.js";

export function TemperatureWidget({ widget }: WallWidgetProps) {
  const { devicesByQualifiedId } = useDataStore();
  const qualifiedId =
    typeof widget.config.qualifiedId === "string" ? widget.config.qualifiedId : "";
  const device = devicesByQualifiedId.get(qualifiedId) ?? null;
  const state = temperatureWidgetState(device, qualifiedId);

  if (state.status === "unavailable") {
    return (
      <div className="flex h-full flex-col justify-center">
        <p style={{ color: "var(--hearth-text-muted)", fontSize: WALL_BODY_FONT_SIZE }}>
          {state.message}
        </p>
      </div>
    );
  }

  const label = device ? humanizeDeviceName(device.displayName) : "Temperature";

  return (
    <div className="flex h-full flex-col justify-center" style={{ gap: "var(--hearth-space-2)" }}>
      <div className="flex items-center" style={{ gap: "var(--hearth-space-2)" }}>
        <Thermometer size={20} aria-hidden style={{ color: "var(--hearth-info)" }} />
        <span
          className="truncate font-semibold uppercase"
          style={{ color: "var(--hearth-text-muted)", fontSize: WALL_LABEL_FONT_SIZE }}
        >
          {label}
        </span>
      </div>
      <p
        className="font-bold"
        style={{ fontFamily: "var(--hearth-font-display)", fontSize: WALL_METRIC_FONT_SIZE }}
      >
        {formatReadoutValue(state.value, state.unit)}
      </p>
    </div>
  );
}
