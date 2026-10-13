## ADDED Requirements

### Requirement: On-Demand Feature Stylesheets

A feature that is loaded on demand MAY ship its own stylesheet. When it does,
that stylesheet MUST be emitted as its own content-hashed asset, referenced by
the feature's on-demand chunk, and excluded from the first-paint transferred-size
budget. The entry document MUST NOT reference it, so a visitor who never opens
the feature never fetches it. Because the asset is content-addressed, a changed
stylesheet MUST be served under a new URL.

#### Scenario: A feature stylesheet is excluded from first paint

- **WHEN** the frontend is built with a feature that ships its own stylesheet
- **THEN** that stylesheet is emitted as a separate content-hashed asset and is
  not counted against the first-paint budget

#### Scenario: The entry does not fetch it

- **WHEN** the dashboard loads and the feature is never opened
- **THEN** the feature's stylesheet is not fetched

#### Scenario: A changed stylesheet invalidates the cache

- **WHEN** the feature's stylesheet changes and the feature is opened again
- **THEN** the client requests the new content-addressed URL rather than a cached
  one
