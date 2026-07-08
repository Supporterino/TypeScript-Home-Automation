## MODIFIED Requirements

### Requirement: Error Handling

Both implementations MUST:
- Log errors on API failures
- Not cache error responses
- Throw on persistent failures (after logging)
- Validate the shape of the parsed response before dereferencing fields or performing arithmetic. Before accessing `data.current`, `data.daily`, per-day arrays, or index positions, the implementation MUST confirm the expected structure exists. A missing `current`/`daily` section, an error body returned with HTTP `200`, or missing array elements MUST result in a thrown descriptive error rather than producing `undefined` values or `NaN` from arithmetic (e.g. `wind_speed / 3.6`)

#### Scenario: Missing current section is rejected

- **WHEN** a weather API returns a `200` body lacking the expected `current` section (e.g. an error/plan-limit body)
- **THEN** the implementation throws a descriptive error instead of returning `undefined`/`NaN` fields

#### Scenario: Malformed forecast arrays are rejected

- **WHEN** the forecast response lacks the expected daily arrays or has fewer entries than requested
- **THEN** the implementation throws a descriptive error rather than producing `NaN` or `undefined` day entries
