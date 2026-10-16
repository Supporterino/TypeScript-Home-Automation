/**
 * The wall temperature widget: a readout of the configured sensor's temperature,
 * with its humidity as a secondary reading when the device declares one.
 */
import { Thermometer } from "lucide-react";
import { formatReadoutValue } from "../../components/CapabilityControl.js";
import { useDataStore } from "../../lib/data-store.js";
import { humanizeDeviceName } from "../../lib/humanize-name.js";
import { WallCardMessage, WallCardReading, WallCardStateItem } from "../cards/card-anatomy.js";
import { WALL_CARD_GLYPH_SIZE } from "../cards/metrics.js";
import type { WallWidgetProps } from "../registry.js";
import { wallReadoutFontSize } from "../scale.js";
import { temperatureSensorLabel, temperatureWidgetState } from "./temperature-model.js";

export function TemperatureWidget({ widget, tier }: WallWidgetProps) {
  const { devicesByQualifiedId, rooms } = useDataStore();
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

  // The label identifies the sensor by its room where the store assigns it one, else by
  // its shortened name; the sensor's full name stays the tooltip.
  const fullName = device ? humanizeDeviceName(device.displayName) : "Temperature";
  const label = device ? temperatureSensorLabel(device, rooms) : fullName;
  const humidity = state.humidity;

  return (
    <div className="flex h-full flex-col justify-center" style={{ gap: "var(--hearth-space-1)" }}>
      <WallCardStateItem
        icon={<Thermometer size={WALL_CARD_GLYPH_SIZE} aria-hidden />}
        tint="var(--hearth-info)"
        label={<span title={fullName}>{label}</span>}
        reading={formatReadoutValue(state.value, state.unit)}
        readingSize={wallReadoutFontSize(tier)}
      />
      {/* The sensor's humidity where it declares one, as the widget's secondary reading. */}
      {humidity !== undefined && (
        <WallCardReading>{formatReadoutValue(humidity.value, humidity.unit)}</WallCardReading>
      )}
    </div>
  );
}
