# Device Types

The framework provides a comprehensive set of TypeScript types for Zigbee device payloads, organised in three layers.

---

## Three-layer hierarchy

| Layer | Purpose | Example |
|---|---|---|
| **Generic** | Work with any device in a category | `OccupancyPayload`, `DimmableLightSetCommand` |
| **Brand-specific** | Narrowed to exact fields per manufacturer | `PhilipsHueMotionSensorPayload`, `IkeaStyrbarPayload` |
| **Primitives** | Shared enums and value types | `DeviceState`, `ColorXY`, `PowerOnBehavior` |

Use generic types when your automation should work with any device in a category. Use brand-specific types when you need the exact action union or model-specific fields.

```ts
// Generic — works with any motion sensor
import type { OccupancyPayload } from "ts-home-automation";
const { occupancy } = payload as OccupancyPayload;

// Brand-specific — includes motion_sensitivity and other Hue-specific fields
import type { PhilipsHueMotionSensorPayload } from "ts-home-automation";
```

---

## Generic types

### Lights

| Type | Description |
|---|---|
| `DimmableLightPayload` / `DimmableLightSetCommand` | Any on/off + brightness bulb |
| `WhiteSpectrumLightPayload` / `WhiteSpectrumLightSetCommand` | Any color-temperature bulb |
| `ColorLightPayload` / `ColorLightSetCommand` | Any RGB/color bulb |
| `LightPayload` / `LightSetCommand` | Catch-all for any light |

### Sensors

| Type | Description |
|---|---|
| `OccupancyPayload` | Any motion/occupancy sensor |
| `TemperatureHumidityPayload` | Any temperature + humidity sensor |
| `ContactPayload` | Any door/window contact sensor |
| `WaterLeakPayload` | Any water leak sensor |
| `AirQualitySensorPayload` | Any air quality / VOC sensor |

### Remotes and plugs

| Type | Description |
|---|---|
| `ButtonPayload` | Any button or remote (`action: string`) |
| `PlugPayload` / `SwitchSetCommand` | Any smart plug or switch |
| `AirPurifierPayload` | Any air purifier |

---

## Brand-specific types

### Philips Hue

| Type | Supported devices |
|---|---|
| `PhilipsDimmableLightSetCommand` | LWG004, 9290030514, 929002241201, 8718699673147 |
| `PhilipsWhiteSpectrumLightSetCommand` | 8719514301481 |
| `PhilipsColorLightSetCommand` | 9290022166, 8718699703424 |
| `PhilipsHueMotionSensorPayload` | 9290012607, 9290030675 |
| `PhilipsHueMotionSensorSetCommand` | sensitivity, LED configuration |

### IKEA

| Type | Supported devices |
|---|---|
| `IkeaDimmableLightSetCommand` | LED2102G3, ICPSHC24 |
| `IkeaWhiteSpectrumLightSetCommand` | LED2005R5, LED2106R3 |
| `IkeaStarkvindPayload` / `IkeaStarkvindSetCommand` | E2007 (STARKVIND air purifier) |
| `IkeaVindstyrkaPayload` | E2112 (VINDSTYRKA air quality sensor) |
| `IkeaStyrbarPayload` / `IkeaStyrbarAction` | E2001/E2002/E2313 (STYRBAR remote) |
| `IkeaShortcutButtonPayload` / `IkeaShortcutButtonAction` | E1812 (shortcut button) |
| `IkeaRodretPayload` / `IkeaRodretAction` | E2201 (RODRET dimmer) |

### Aqara

| Type | Supported devices |
|---|---|
| `AqaraRemoteSwitchH1Payload` / `AqaraRemoteSwitchH1SetCommand` | WXKG15LM / WRS-R02 (H1 double rocker) |
| `AqaraWaterLeakPayload` | SJCGQ11LM (water leak sensor) |
| `AqaraTemperatureHumidityPayload` | WSDCGQ11LM (temperature + humidity + pressure) |

---

## Common primitives

| Type | Values |
|---|---|
| `DeviceState` | `"ON"` \| `"OFF"` |
| `PowerOnBehavior` | `"on"` \| `"off"` \| `"previous"` |
| `ColorXY` | `{ x: number; y: number }` |

---

## Adding device types

If you need types for a device not listed here, open a pull request or file an issue. The type files live in `src/types/` — each file is focused on a brand or category and follows the naming conventions documented in `AGENTS.md`.
