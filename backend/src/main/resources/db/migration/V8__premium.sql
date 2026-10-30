-- The ad-free plan (3 € a month), paid with Stripe. Stripe owns the payment and the card; this table only keeps what
-- the site needs to decide: is this account paying now? One row per account, updated by Stripe's webhooks.
create table subscription (
	user_id             bigint      primary key references app_user (id) on delete cascade,
	stripe_customer     text        not null unique,
	stripe_subscription text        not null unique,
	-- Stripe's own words: active, trialing, past_due, canceled, unpaid, incomplete, incomplete_expired, paused.
	status              text        not null,
	current_period_end  timestamptz,
	updated_at          timestamptz not null default now()
);

-- Every webhook event processed, by Stripe's id: Stripe may send one event more than once.
create table stripe_event (
	id          text        primary key,
	type        text        not null,
	received_at timestamptz not null default now()
);
