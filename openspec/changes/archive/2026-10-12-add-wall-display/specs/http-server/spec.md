## ADDED Requirements

### Requirement: Wall Profile Endpoints

The system MUST expose endpoints to list wall profiles, read one profile,
create a profile, update a profile (including renaming it), and delete a
profile. These endpoints MUST sit behind the same authorisation as the rest of
`/api/*`.

- Creating or renaming a profile to an identifier already in use MUST return a
  descriptive conflict error and MUST NOT overwrite the existing profile.
- Reading or deleting an unknown profile MUST return 404.
- A profile's configuration MUST be validated on write; an invalid
  configuration MUST be rejected with a descriptive error and MUST NOT be
  persisted.
- Deleting a profile MUST succeed and MUST NOT affect any other profile.
- Profiles MUST persist across an engine restart.

#### Scenario: A profile is created and read back

- **WHEN** a profile is created and then read
- **THEN** the stored configuration is returned

#### Scenario: Duplicate identifier is rejected

- **WHEN** a profile is created with an identifier already in use
- **THEN** an error response is returned and the existing profile is unchanged

#### Scenario: Unknown profile returns not found

- **WHEN** a request addresses a profile identifier that does not exist
- **THEN** the response is 404

#### Scenario: An invalid configuration is rejected

- **WHEN** a profile is written with a configuration that fails validation
- **THEN** the response is a descriptive error and nothing is persisted

#### Scenario: Authorization is enforced

- **WHEN** a token is configured and a wall-profile request is made without
  valid credentials
- **THEN** the request is refused as unauthorised
