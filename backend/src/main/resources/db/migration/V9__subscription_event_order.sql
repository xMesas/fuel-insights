-- When Stripe created the last event applied to each subscription: events arrive in any order, and an older one
-- (an "active" sent before the "canceled") must never undo a newer one.
alter table subscription add column last_event_created bigint not null default 0;
