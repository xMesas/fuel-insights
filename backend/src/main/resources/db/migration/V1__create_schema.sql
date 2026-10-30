create table province (
	id   char(2) primary key,
	name text    not null
);

create table station (
	id           integer primary key,
	brand_raw    text          not null,
	address      text,
	municipality text,
	province_id  char(2)       not null references province (id),
	postal_code  text,
	latitude     numeric(9, 6),
	longitude    numeric(9, 6),
	first_seen   date          not null,
	last_seen    date          not null
);

create table price_daily (
	day        date          not null,
	station_id integer       not null references station (id),
	fuel       text          not null check (fuel in ('GASOLEO_A', 'GASOLINA_95_E5', 'GASOLEO_PREMIUM', 'GASOLINA_98_E5')),
	price      numeric(5, 3) not null check (price > 0),
	primary key (day, station_id, fuel)
);

create table import_day (
	day         date        primary key,
	stations    integer     not null,
	prices      integer     not null,
	finished_at timestamptz not null
);
