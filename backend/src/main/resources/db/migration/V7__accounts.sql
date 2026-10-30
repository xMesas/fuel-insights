-- Accounts. The email is the whole identity: people sign in with a link sent to it, so there are no passwords.
-- Deleting an account deletes its favourites and alerts with it.
create table app_user (
	id            bigint      generated always as identity primary key,
	email         text        not null unique check (email = lower(email)),
	created_at    timestamptz not null default now(),
	last_login_at timestamptz
);

create table favourite_station (
	user_id    bigint      not null references app_user (id) on delete cascade,
	station_id integer     not null references station (id),
	created_at timestamptz not null default now(),
	primary key (user_id, station_id)
);

-- "Tell me when this station sells this fuel at this price or less." Sent at most once a day.
create table price_alert (
	id           bigint        generated always as identity primary key,
	user_id      bigint        not null references app_user (id) on delete cascade,
	station_id   integer       not null references station (id),
	fuel         text          not null,
	threshold    numeric(5, 3) not null check (threshold > 0),
	created_at   timestamptz   not null default now(),
	last_sent_at timestamptz,
	unique (user_id, station_id, fuel)
);

-- Spring Security's one-time tokens (core/ott/jdbc/one-time-tokens-schema.sql), with room for any email.
create table one_time_tokens (
	token_value varchar(36) primary key,
	username    text        not null,
	expires_at  timestamp   not null
);

create index one_time_tokens_username on one_time_tokens (username);

-- Spring Session JDBC (session/jdbc/schema-postgresql.sql): sessions survive a restart or a new release.
create table spring_session (
	primary_id            char(36)     not null,
	session_id            char(36)     not null,
	creation_time         bigint       not null,
	last_access_time      bigint       not null,
	max_inactive_interval int          not null,
	expiry_time           bigint       not null,
	principal_name        varchar(100),
	constraint spring_session_pk primary key (primary_id)
);

create unique index spring_session_ix1 on spring_session (session_id);
create index spring_session_ix2 on spring_session (expiry_time);
create index spring_session_ix3 on spring_session (principal_name);

create table spring_session_attributes (
	session_primary_id char(36)     not null,
	attribute_name     varchar(200) not null,
	attribute_bytes    bytea        not null,
	constraint spring_session_attributes_pk primary key (session_primary_id, attribute_name),
	constraint spring_session_attributes_fk foreign key (session_primary_id) references spring_session (primary_id)
		on delete cascade
);
