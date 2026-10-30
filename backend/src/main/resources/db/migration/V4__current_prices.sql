-- The prices in force now, from the Ministry list refreshed every half hour. Each import replaces the whole
-- snapshot in one transaction, so readers see the old one or the new one, never a mix.
create table price_current (
	station_id integer       not null references station (id),
	fuel       text          not null check (fuel in ('GASOLEO_A', 'GASOLINA_95_E5', 'GASOLEO_PREMIUM', 'GASOLINA_98_E5')),
	price      numeric(5, 3) not null check (price > 0),
	primary key (station_id, fuel)
);

create index price_current_fuel on price_current (fuel);

-- Details that only the current list carries. Kept apart from station so this import never updates (and locks)
-- the catalog rows that the daily import writes.
create table station_current (
	station_id integer primary key references station (id),
	schedule   text
);

-- One row: the Ministry's own time for the snapshot in price_current.
create table current_snapshot (
	id           boolean     primary key default true check (id),
	published_at timestamptz not null,
	imported_at  timestamptz not null,
	stations     integer     not null,
	prices       integer     not null
);
