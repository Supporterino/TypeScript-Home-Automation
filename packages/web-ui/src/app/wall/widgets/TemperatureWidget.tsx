/**
 * The wall temperature widget (design.md D11, D13; wall-zones-and-fit D3, D6;
 * specs/wall-display "Widget Catalog", "Touch Operation", "Span-Aware Card
 * Presentation"). A readout — not a control — presenting the configured sensor
 * device's temperature, chrome-less on the panel, on the tier its span calls for:
 * a grouped readout (a climate band, or the same readout on a small card) sits on
 * the band tier so it does not compete with a card's hero, and a readout with a
 * genuinely large span grows onto the metric tier. The value and its unit render
 * as one non-breaking unit, so a narrow cell never splits them.
 *
 * A device that is not (or is no longer) known, or that reports no temperature,
 * renders a contained explanation inside the widget's own area rather than a
 * throw that would take down the profile; the rest of the profile still renders.
 * Every wall token is Hearth's own (design.md D1, D2) — never a Lumen alias.
 */
import { Thermometer } from "lucide-react";
import { formatReadoutValue } from "../../components/CapabilityControl.js";
import { useDataStore } from "../../lib/data-store.js";
import { humanizeDeviceName, shortDeviceName } from "../../lib/humanize-name.js";
import type { WallWidgetProps } from "../registry.js";
import { wallReadoutFontSize } from "../scale.js";
import { WALL_BODY_FONT_SIZE, WALL_LABEL_FONT_SIZE } from "../type-ramp.js";
import { temperatureWidgetState } from "./temperature-model.js";

export function TemperatureWidget({ widget, tier }: WallWidgetProps) {
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
          title={label}
          style={{ color: "var(--hearth-text-muted)", fontSize: WALL_LABEL_FONT_SIZE }}
        >
          {shortDeviceName(label)}
        </span>
      </div>
      <p
        className="font-bold"
        style={{
          fontFamily: "var(--hearth-font-display)",
          fontSize: wallReadoutFontSize(tier),
          // The reading and its unit render as one non-breaking unit, so a
          // narrow span never splits the value from its unit (design.md D6;
          // specs/wall-display "A value stays with its unit").
          whiteSpace: "nowrap",
        }}
      >
        {formatReadoutValue(state.value, state.unit)}
      </p>
    </div>
  );
}
