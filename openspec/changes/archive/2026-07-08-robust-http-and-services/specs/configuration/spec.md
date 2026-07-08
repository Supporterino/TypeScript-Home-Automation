## MODIFIED Requirements

### Requirement: Boolean Coercion

The system MUST coerce boolean environment variables tolerantly — matching is case-insensitive and ignores surrounding whitespace:
- Truthy: `"true"`, `"1"`, `"yes"`, `"on"` (any letter case, trimmed)
- Falsy: `"false"`, `"0"`, `"no"`, `"off"` (any letter case, trimmed)
- Undefined/missing: `undefined` (falls through to Zod default)

A value that does not match any recognized token MUST NOT throw an uncaught error. The coercion MUST be performed inside the schema so any failure is reported through the normal validation-failure path (formatted error message + `process.exit(1)`), consistent with all other config validation.

#### Scenario: Uppercase boolean is coerced

- **WHEN** an environment variable is set to `"TRUE"` or `"On"`
- **THEN** it is coerced to the corresponding boolean without throwing

#### Scenario: Invalid boolean fails gracefully

- **WHEN** a boolean environment variable is set to an unrecognized value (e.g. `"maybe"`)
- **THEN** the system reports a formatted validation error and exits via `process.exit(1)`, rather than throwing an uncaught `ZodError` with a raw stack trace
