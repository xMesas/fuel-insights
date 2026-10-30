-- Public charging sites for electric vehicles, from the feed the Ministry for the Ecological Transition publishes
-- through the DGT (refreshed daily). Like the current fuel prices, each import replaces the whole snapshot in one
-- transaction. The source's codes are kept; the read API turns them into words.
create table charging_site (
	id           text primary key,
	name         text,
	operator     text,
	address      text,
	town         text,
	province     text,
	postcode     text,
	latitude     numeric(9, 6) not null,
	longitude    numeric(9, 6) not null,
	max_power_kw numeric(6, 1) check (max_power_kw > 0),
	points       integer not null check (points >= 0),
	schedule     text,
	payment      text[] not null,
	updated_at   timestamptz
);

-- The connectors of a site grouped by type, current and power: "2 x CCS2, DC, 150 kW".
create table charging_connector (
	site_id        text          not null references charging_site (id) on delete cascade,
	connector_type text          not null,
	current        text          not null check (current in ('AC', 'DC')),
	power_kw       numeric(6, 1) not null check (power_kw > 0),
	connectors     integer       not null check (connectors > 0),
	primary key (site_id, connector_type, current, power_kw)
);

-- One row: the feed's own time for the snapshot in charging_site.
create table charging_snapshot (
	id           boolean     primary key default true check (id),
	published_at timestamptz not null,
	imported_at  timestamptz not null,
	sites        integer     not null,
	points       integer     not null
);
