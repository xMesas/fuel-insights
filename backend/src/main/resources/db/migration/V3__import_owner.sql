-- Fencing token: the Batch job execution that currently owns the day. Every write checks it,
-- so an import that lost the lock (but is still running) cannot write after a newer one took over.
alter table import_day add column owner_execution bigint;
