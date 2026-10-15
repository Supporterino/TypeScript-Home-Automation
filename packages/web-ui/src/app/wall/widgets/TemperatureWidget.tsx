/**
 * The wall temperature widget (design.md D11, D13, W1, W5; wall-zones-and-fit D3,
 * D6; specs/wall-display "Widget Catalog", "Touch Operation", "Span-Aware Card
 * Presentation"). A readout — not a control — presenting the configured sensor
 * device's temperature, chrome-less on the panel, composed on the wall's single
 * card vocabulary: the ported circular thermometer affordance, the sensor's name
 * as the label, and the reading below it. The reading keeps the wall's own
 * distance tier, chosen by the span the widget was placed at: a grouped readout
 * (a climate band, or the same readout on a small card) sits on the band tier so
 * it does not compete with a card's hero, and a readout with a genuinely large
 * span grows onto the metric tier (design.md W2). The value and its unit render
 * as one non-breaking unit, so a narrow cell never splits them.
 *
 * A sensor that declares a humidity on the same device presents it as the
 * widget's secondary reading — one value with its own unit, on the ported
 * secondary type, drawn by the vocabulary's own reading part rather than by a
 * treatment of the widget's (design.md W5; specs/wall-display "A temperature
 * widget shows its sensor's humidity"). A sensor that declares none renders
 * exactly as before: no line, no placeholder ("A sensor without humidity shows
 * only its temperature").
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
import { WallCardMessage, WallCardReading, WallCardStateItem } from "../cards/card-anatomy.js";
import { WALL_CARD_GLYPH_SIZE } from "../cards/metrics.js";
import type { WallWidgetProps } from "../registry.js";
import { wallReadoutFontSize } from "../scale.js";
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
        <WallCardMessage>{state.message}</WallCardMessage>
      </div>
    );
  }

  const label = device ? humanizeDeviceName(device.displayName) : "Temperature";
  const humidity = state.humidity;

  return (
    <div className="flex h-full flex-col justify-center" style={{ gap: "var(--hearth-space-1)" }}>
      <WallCardStateItem
        icon={<Thermometer size={WALL_CARD_GLYPH_SIZE} aria-hidden />}
        tint="var(--hearth-info)"
        // The full name stays the tooltip while the card shows the shortened form
        // (specs/wall-display "A name is shortened, not truncated").
        label={<span title={label}>{shortDeviceName(label)}</span>}
        reading={formatReadoutValue(state.value, state.unit)}
        readingSize={wallReadoutFontSize(tier)}
      />
      {/* The sensor's own humidity, where it declares one: the widget's secondary
          reading, one value with its unit on the vocabulary's reading part — whose
          own size is the ported secondary size — and no line at all where the
          sensor declares none (design.md W5). */}
      {humidity !== undefined && (
        <WallCardReading>{formatReadoutValue(humidity.value, humidity.unit)}</WallCardReading>
      )}
    </div>
  );
}
