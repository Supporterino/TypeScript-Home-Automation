## ADDED Requirements

### Requirement: Energy Monitoring Configuration

The configuration schema MUST include an `energy` section governing the rolling
energy history, mapped from environment variables:

| Environment Variable | Config Path | Default | Meaning |
|---|---|---|---|
| `ENERGY_SAMPLE_MS` | `energy.sampleIntervalMs` | `60000` | Interval between power-history samples |
| `ENERGY_HISTORY_MINUTES` | `energy.historyMinutes` | `1440` | Rolling window; `0` disables history |

Both values MUST be non-negative integers. A sampling interval of `0` MUST be
rejected or normalized so that history cannot be sampled at zero interval. When
`historyMinutes` is `0`, history is disabled and the engine MUST still expose
current totals.

#### Scenario: Energy defaults are applied

- **WHEN** configuration is loaded with no energy variables set
- **THEN** `energy.sampleIntervalMs` is `60000` and `energy.historyMinutes` is
  `1440`

#### Scenario: History can be disabled

- **WHEN** `ENERGY_HISTORY_MINUTES` is `0`
- **THEN** history is disabled and current totals remain available

### Requirement: Weather Location Configuration

The configuration schema MUST include a `weather` section providing an optional
default location and a bounded forecast horizon, mapped from environment
variables:

| Environment Variable | Config Path | Default | Meaning |
|---|---|---|---|
| `WEATHER_LATITUDE` | `weather.latitude` | _unset_ | Default latitude |
| `WEATHER_LONGITUDE` | `weather.longitude` | _unset_ | Default longitude |
| `WEATHER_FORECAST_DAYS` | `weather.forecastDays` | `3` | Requested forecast days, bounded to a maximum |

Latitude and longitude MUST be valid ranges when set, and MUST both be set for
a default location to be considered configured. `forecastDays` MUST be clamped
to a small maximum. When no default location is configured, the weather endpoint
requires the client to supply one.

#### Scenario: A complete location is required

- **WHEN** only one of `WEATHER_LATITUDE` or `WEATHER_LONGITUDE` is set
- **THEN** no default location is considered configured

#### Scenario: Forecast days are bounded

- **WHEN** `WEATHER_FORECAST_DAYS` exceeds the maximum
- **THEN** it is clamped to the maximum rather than used unbounded

#### Scenario: Out-of-range coordinates are rejected

- **WHEN** a configured latitude or longitude is outside its valid range
- **THEN** startup validation fails with a descriptive error
