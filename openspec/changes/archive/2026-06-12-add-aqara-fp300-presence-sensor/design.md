## Context

The codebase has well-established Zigbee2MQTT type definitions in `src/types/zigbee/`. Brand files (`aqara.ts`, `ikea.ts`, `philips.ts`) extend generic cross-brand payloads defined in `common.ts`. The Aqara FP300 (model PS-S04D) is a mmWave + PIR dual-technology presence sensor that reports continuous presence, target distance, temperature, humidity, illuminance, and PIR detection state. Currently, only `OccupancyPayload` exists for PIR motion sensors — there is no presence sensor type.

Real MQTT state data and the official [Zigbee2MQTT device page](https://www.zigbee2mqtt.io/devices/PS-S04D.html) were used to determine the actual exposed fields rather than guessing.

## Goals / Non-Goals

**Goals:**
- Add a new generic `PresencePayload` for any mmWave presence sensor (cross-brand)
- Add a minimal generic `PresenceSetCommand` for cross-brand presence sensor config
- Add an `AqaraPresencePayload` extending the generic type with FP300-specific fields
- Add an `AqaraPresenceSetCommand` for FP300-specific config and write-only commands
- Re-export all new types from the barrel files

**Non-Goals:**
- No automation logic or device-specific base classes (sensors don't get abstract base classes in this codebase — only remotes/dimmers do)
- No changes to the device registry or engine
- No runtime behavior changes

## Decisions

### Decision 1: New generic `PresencePayload` vs. reusing `OccupancyPayload`

**Chosen:** New `PresencePayload` with `presence` boolean (not `occupancy`).

**Rationale:** mmWave presence sensors use `presence` as the Zigbee2MQTT exposed key, not `occupancy`. The FP300 reports continuous presence (someone IS in the room) with target distance, while PIR occupancy sensors report binary motion events (movement WAS detected). The field sets differ — `PresencePayload` includes `target_distance` and `humidity` that `OccupancyPayload` lacks, while omitting `illuminance` (single field, not `illuminance`/`illuminance_lux` dual).

**Alternative considered:** Extending `OccupancyPayload`. Rejected because the semantics differ fundamentally and field names don't align.

### Decision 2: Generic `PresencePayload` fields

**Chosen:** Lean but meaningful — 8 fields covering the core sensor readings any mmWave presence sensor reports:

```ts
interface PresencePayload {
  presence: boolean;
  target_distance?: number;
  illuminance?: number;
  temperature?: number;
  humidity?: number;
  battery?: number;
  voltage?: number;
  linkquality?: number;
}
```

**Rationale:** These are the fields observed on the FP300 that are also likely to appear on other mmWave presence sensors (FP1 has `presence`, `device_temperature`, `target_distance`; FP300 adds `illuminance`, `humidity`, `temperature`). `illuminance_lux` was in the original spec but the FP300 uses `illuminance` (no suffix). `presence_event` was removed — the FP300 does not expose it (unlike the FP1 which does).

### Decision 3: Generic `PresenceSetCommand` fields

**Chosen:** Minimal — a single cross-brand config field:

```ts
interface PresenceSetCommand {
  motion_sensitivity?: "low" | "medium" | "high";
}
```

**Rationale:** `motion_sensitivity` (not `sensitivity`) is the actual field name on both FP1 and FP300. `detection_range` was removed from the generic type because its semantics differ wildly across devices — on FP300 it's a raw 24-bit hardware value (0–16,777,215) with a companion `detection_range_composite` field for zone configuration, not meters as originally assumed.

### Decision 4: FP300-specific fields

**Chosen:** `AqaraPresencePayload` includes 11 FP300-meaningful fields beyond the generic base, selected for relevance to automations:

```ts
interface AqaraPresencePayload extends PresencePayload {
  pir_detection?: boolean;
  presence_detection_options?: "both" | "mmwave" | "pir";
  motion_sensitivity?: "low" | "medium" | "high";
  ai_interference_source_selfidentification?: "ON" | "OFF";
  ai_sensitivity_adaptive?: "ON" | "OFF";
  absence_delay_timer?: number;
  pir_detection_interval?: number;
  detection_range?: number;
  detection_range_composite?: Record<string, boolean>;
  power_outage_count?: number;
}
```

`AqaraPresenceSetCommand` includes all writable FP300 fields plus write-only commands:

```ts
interface AqaraPresenceSetCommand extends PresenceSetCommand {
  presence_detection_options?: "both" | "mmwave" | "pir";
  ai_interference_source_selfidentification?: "ON" | "OFF";
  ai_sensitivity_adaptive?: "ON" | "OFF";
  absence_delay_timer?: number;
  pir_detection_interval?: number;
  detection_range?: number;
  detection_range_composite?: Record<string, boolean>;
  spatial_learning?: "Start Learning";
  restart_device?: "Restart Device";
  identify?: "identify";
  track_target_distance?: "start_tracking_distance";
}
```

**Rationale:** The FP300 exposes 37 fields total. Reporting/sampling configuration fields (`temp_and_humidity_sampling`, `light_reporting_interval`, etc.) and LED schedule fields (`schedule_start_time`, `schedule_end_time`) are intentionally excluded — they're infrequently used setup options that don't appear in automation logic. The included fields are either read by automations or commonly configured. `detection_range_composite` uses `Record<string, boolean>` rather than a fixed set of 24 keys to stay flexible — different mmWave sensors may expose different zone grids.

### Decision 5: Field selection philosophy

**Chosen:** Lean but all important fields included. Skip reporting/sampling config, LED schedules, and calibration options.

**Rationale:** The existing pattern (`OccupancyPayload` has 6 fields, `ContactPayload` has 5) keeps payloads focused on what automations actually read. An automation checking "is someone in the living room and what's the temperature?" needs the core sensor fields. It does not need `temp_reporting_mode` or `schedule_end_time`. Users who need those fields can still access them via `Record<string, unknown>` casting.

### Decision 6: Prometheus metrics for presence sensors

**Chosen:** Add three new gauges to `PrometheusMetricsService`: `zigbee_device_presence` (boolean), `zigbee_device_target_distance` (number, meters), and `zigbee_device_pir_detection` (boolean). Keep `zigbee_device_occupancy` unchanged.

**Rationale:** The metrics service currently only checks for `occupancy` in device state (line 429). An FP300 reporting `presence: true` is silently dropped. `target_distance` and `pir_detection` are also unexposed. Adding separate gauges preserves the semantic distinction between PIR motion (transient "movement detected") and mmWave presence (continuous "someone IS here") — matching how the type system uses `OccupancyPayload` vs `PresencePayload` as distinct interfaces. Environmental fields (`temperature`, `humidity`, `illuminance`) and diagnostic fields (`battery`, `voltage`, `linkquality`, `power_outage_count`) are already handled by existing gauges.

**Alternative considered:** Map `presence` to the existing `zigbee_device_occupancy` gauge. Rejected because they represent different detection technologies with different semantics — conflating them loses signal.

### Decision 7: File placement

**Chosen:** Generic types in `common.ts`, Aqara-specific in `aqara.ts`, following the exact pattern of every other device category.

**Alternative considered:** New dedicated `presence.ts` file. Rejected because no other sensor category has its own file — all generic sensor payloads are in `common.ts`.

## Risks / Trade-offs

- **`presence_event` absent from FP300**: The FP1 exposes `presence_event` but the FP300 does not. The generic `PresencePayload` omits it. If a future presence sensor exposes events, a brand-specific extension can add it — or it can be added to the generic type as optional without breaking changes.
- **`detection_range_composite` is loosely typed**: Using `Record<string, boolean>` instead of a fixed union of 24 keys sacrifices some type safety for flexibility. Different mmWave sensors may expose different zone counts.
- **Excluded fields**: Automation authors who need reporting/sampling config or LED schedules will need to use untyped access (`(payload as Record<string, unknown>).temp_reporting_mode`). These can be added later if demand arises.
- **Separate occupancy/presence gauges**: Users with both PIR motion sensors and mmWave presence sensors will need to query both `zigbee_device_occupancy` and `zigbee_device_presence` for a complete "is anyone home?" picture. This is intentional — the two technologies have different false-positive/false-negative profiles.
