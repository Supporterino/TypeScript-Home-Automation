# Scheduling

## Purpose

Cron-based job scheduling using the `cron` npm package. Automations register cron triggers that fire on a schedule, enabling time-based automation logic (e.g. "turn lights on at sunset", "send a daily report").

## Requirements

### Job Scheduling

`schedule(id, expression, callback)` MUST:
- Create a `CronJob` from the cron expression
- Start the job immediately (`start: true`)
- Use the configured timezone (from `TZ` environment variable, or system default)
- Call the callback when the expression matches
- Log each trigger with `{ id, expression }`
- Catch and log errors from the callback (do not crash the scheduler)

The `id` parameter MUST be unique and is typically formatted as `"<automationName>:cron:<triggerIndex>"`.

### Job Removal

`remove(id)` MUST:
- Stop the cron job
- Remove it from the internal map

`removeByPrefix(prefix)` MUST:
- Stop all jobs whose IDs start with the given prefix
- Remove them from the internal map
- Log the count of removed jobs

This is used during automation shutdown (`stopAll()` passes `"<automationName>:"`).

### Bulk Stop

`stopAll()` MUST:
- Stop all scheduled jobs
- Clear the internal map
- Log the total count of stopped jobs

### Timezone

The system MUST read the `TZ` environment variable at construction time. If unset, jobs use the system's default timezone.

The system MUST log the effective timezone on initialization with current system time and local hour for debugging.

### Error Handling

The system MUST catch errors thrown by job callbacks and log them with the job `id`. A failing callback MUST NOT affect other scheduled jobs or prevent future executions of the same job.
