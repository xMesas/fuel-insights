# Interview questions: phase 2

## 1. How do chunk transactions affect what the web can read?

`ImportJobConfig.loadPrices` commits one chunk of 1,000 stations at a time.
A failure can leave some raw prices committed, so `StatsRepository` reads price statistics only from `price_stats_daily`.
`publishDay` rebuilds those aggregates and marks the day published in one transaction.
Until it commits, the web keeps the previous published numbers, or shows no data for a new day.

## 2. Why do the first two steps use `allowStartIfComplete(true)`?

In `ImportJobConfig`, `prepareDay` and `loadPrices` must run again on a restart, even if they finished before.
`prepareDay` deletes the day's raw prices, and `loadPrices` reads and writes the whole day again.
If only one step ran again, the import could publish missing or stale prices.
This also handles a failed `publishDay` after a completed load.

## 3. How does the advisory lock help recover from a dead process?

`ImportLock` uses `pg_try_advisory_lock` on a separate database connection to allow one import across app instances.
The lock belongs to that database session; PostgreSQL releases it when the session ends after a process dies.
Once `DayImporter` holds the lock, no other importer can be running under the same lock.
Its `recoverAbandonedExecutions` method then recovers Batch executions still marked as running, so they can restart.
The lock alone is not proof that the old process is dead (only its session may have been closed), so `prepareDay` also stores the execution as the day's owner and every chunk and the publication check it with `select ... for update` (a fencing token).

## 4. Why inspect the result of `JobOperator.start`?

In `DayImporter.run`, a job failure can be recorded in the returned `JobExecution` without being thrown to the caller.
The method checks that its status is `COMPLETED` and reads the failure exceptions otherwise.
It marks the day failed and throws a `MinistryException` or `ImportFailedException`.
Without this check, an unsuccessful import could be reported as a success.

## 5. Why use `RANGE` instead of `ROWS` for the moving average?

`StatsRepository.trend` uses `RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW` for 7 calendar days.
`ROWS` counts rows, which could cover a longer period when dates are missing; the query also generates every date.
It reads from 6 days before `from`, calculates the window, then cuts back to the requested range.
The result is `null` if the current day has no data or the window has fewer than 4 days with data.

## 6. What makes a re-import idempotent?

`DayImporter` skips a completed day unless `force=true`; a forced import adds a new identifying `run` parameter.
`ImportJobConfig.prepareDay` deletes old prices, so prices removed by the Ministry do not survive.
`PriceRepository` upserts by day, station and fuel, and `DailyStatsRepository.rebuildDay` replaces the day's aggregates.
Repeating an import with the same source data gives the same price statistics, without duplicate rows.
