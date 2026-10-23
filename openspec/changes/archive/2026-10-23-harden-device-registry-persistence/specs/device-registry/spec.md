## ADDED Requirements

### Requirement: Durable Snapshot Writes

The registry MUST write its snapshot durably: serialize to a temporary file,
flush it to disk, preserve the previous good snapshot as `filePath` + `.bak`,
and atomically rename the temporary file over `filePath`. An interrupted or
failed write MUST leave the primary file parseable as either the previous
snapshot or the new one, never a mixture of both.

Serialization MUST be fault-tolerant per entry: a device or state entry that
cannot be serialized MUST be skipped and logged, and MUST NOT prevent the rest
of the snapshot from being written. A failed save MUST be logged and MUST NOT
prevent the remaining shutdown steps from running.

#### Scenario: An interrupted write leaves the previous snapshot intact

- **WHEN** the process is interrupted after the temporary file is written but
  before the atomic rename completes
- **THEN** `filePath` still contains the previous complete snapshot
- **AND** the next load parses it successfully

#### Scenario: The previous snapshot is preserved as a backup

- **WHEN** a snapshot is saved over an existing file
- **THEN** the previous complete file is available at `filePath` + `.bak`
- **AND** the new snapshot is readable at `filePath`

#### Scenario: An unserializable entry is skipped

- **WHEN** one device or state entry cannot be serialized
- **THEN** that entry is logged and omitted
- **AND** the snapshot is still written with every other entry

#### Scenario: A failed save is non-fatal

- **WHEN** the snapshot cannot be written
- **THEN** the failure is logged
- **AND** the engine continues its shutdown sequence

### Requirement: Snapshot Corruption Recovery

On load, the registry MUST treat an unparseable or structurally invalid primary
snapshot as recoverable. It MUST log the failure, attempt to restore the same
snapshot from `filePath` + `.bak`, and MUST NOT throw. If neither file can be
used, the registry MUST start empty and log the failure. The success log MUST
identify which file was used. Structurally invalid entries within an otherwise
usable snapshot MUST be skipped with a warning rather than rejecting the whole
snapshot.

#### Scenario: A corrupt primary is recovered from the backup

- **WHEN** `filePath` is corrupt and `filePath` + `.bak` holds a valid snapshot
- **THEN** the registry restores devices, states, and groups from the backup
- **AND** it logs the corruption and the backup path
- **AND** it does not throw

#### Scenario: Corrupt primary and unusable backup start empty

- **WHEN** `filePath` is corrupt and `filePath` + `.bak` is missing or corrupt
- **THEN** the registry starts empty
- **AND** it logs both failures
- **AND** the engine continues starting

#### Scenario: Malformed entries are skipped

- **WHEN** a usable snapshot contains a device, state, or group entry that does
  not match the expected structure
- **THEN** that entry is logged and skipped
- **AND** the remaining entries are restored
