## MODIFIED Requirements

### Requirement: Job Scheduling

`schedule(id, expression, callback)` MUST:
- Create a `CronJob` from the cron expression
- If a job is already registered under the same `id`, stop the existing `CronJob` before replacing it, so the previous job's timer is not leaked
- Start the job immediately (`start: true`)
- Use the configured timezone (from `TZ` environment variable, or system default)
- Call the callback when the expression matches
- Log each trigger with `{ id, expression }`
- `await` the callback result and catch both synchronous throws and asynchronous rejections, logging them with the job `id` (do not crash the scheduler, do not surface an unhandled rejection)

The `id` parameter MUST be unique and is typically formatted as `"<automationName>:cron:<triggerIndex>"`.

#### Scenario: Re-scheduling an existing id stops the old job

- **WHEN** `schedule()` is called with an `id` that already has a running job
- **THEN** the previously scheduled `CronJob` is stopped before the new one replaces it, and no orphaned timer continues to fire

### Requirement: Error Handling

The system MUST catch errors thrown by job callbacks and log them with the job `id`. This MUST include asynchronous rejections from callbacks that return a promise — the scheduler MUST `await` the callback so a rejected promise is captured and logged rather than becoming an unhandled rejection. A failing callback MUST NOT affect other scheduled jobs or prevent future executions of the same job.

#### Scenario: Async rejection in a callback is caught

- **WHEN** a scheduled callback returns a promise that rejects
- **THEN** the rejection is caught and logged with the job `id`, and does not become an unhandled promise rejection
