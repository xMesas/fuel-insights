package com.fuelinsights.stations;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;

/** Keeps the station catalog up to date from each imported day. */
@Repository
public class StationRepository {

	private static final String UPSERT_PROVINCE = """
			insert into province (id, name) values (:id, :name)
			on conflict (id) do nothing
			""";

	// An older day must not overwrite what a newer day already wrote: the details only change
	// when the incoming day is at least as recent as last_seen, while first_seen can still move back.
	private static final String UPSERT_STATION = """
			insert into station (id, brand_raw, brand, address, municipality, province_id, postal_code,
				latitude, longitude, first_seen, last_seen)
			values (:id, :brandRaw, :brand, :address, :municipality, :provinceId, :postalCode,
				:latitude, :longitude, :day, :day)
			on conflict (id) do update set
				brand_raw = case when excluded.last_seen >= station.last_seen then excluded.brand_raw else station.brand_raw end,
				brand = case when excluded.last_seen >= station.last_seen then excluded.brand else station.brand end,
				address = case when excluded.last_seen >= station.last_seen then excluded.address else station.address end,
				municipality = case when excluded.last_seen >= station.last_seen then excluded.municipality else station.municipality end,
				province_id = case when excluded.last_seen >= station.last_seen then excluded.province_id else station.province_id end,
				postal_code = case when excluded.last_seen >= station.last_seen then excluded.postal_code else station.postal_code end,
				latitude = case when excluded.last_seen >= station.last_seen then excluded.latitude else station.latitude end,
				longitude = case when excluded.last_seen >= station.last_seen then excluded.longitude else station.longitude end,
				first_seen = least(station.first_seen, excluded.first_seen),
				last_seen = greatest(station.last_seen, excluded.last_seen)
			""";

	// The current prices only add the stations the catalog does not know yet: updating existing rows is the daily
	// import's job, and "do nothing" takes no lock on them, so the two imports never wait for each other.
	private static final String INSERT_MISSING_STATION = """
			insert into station (id, brand_raw, brand, address, municipality, province_id, postal_code,
				latitude, longitude, first_seen, last_seen)
			values (:id, :brandRaw, :brand, :address, :municipality, :provinceId, :postalCode,
				:latitude, :longitude, :day, :day)
			on conflict (id) do nothing
			""";

	private final NamedParameterJdbcTemplate jdbc;

	public StationRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public void upsertAll(LocalDate day, List<Station> stations) {
		upsertProvinces(stations);
		this.jdbc.batchUpdate(UPSERT_STATION, parameters(day, stations));
	}

	public void insertMissing(LocalDate day, List<Station> stations) {
		upsertProvinces(stations);
		this.jdbc.batchUpdate(INSERT_MISSING_STATION, parameters(day, stations));
	}

	private static SqlParameterSource[] parameters(LocalDate day, List<Station> stations) {
		return stations.stream()
			.map((station) -> new MapSqlParameterSource()
				.addValue("id", station.id())
				.addValue("brandRaw", station.brandRaw())
				.addValue("brand", station.brand())
				.addValue("address", station.address())
				.addValue("municipality", station.municipality())
				.addValue("provinceId", station.provinceId())
				.addValue("postalCode", station.postalCode())
				.addValue("latitude", station.latitude())
				.addValue("longitude", station.longitude())
				.addValue("day", day))
			.toArray(SqlParameterSource[]::new);
	}

	private void upsertProvinces(List<Station> stations) {
		SqlParameterSource[] batch = stations.stream()
			.collect(Collectors.toMap(Station::provinceId, Function.identity(), (first, second) -> first))
			.values()
			.stream()
			.sorted(Comparator.comparing(Station::provinceId))
			.map((station) -> new MapSqlParameterSource()
				.addValue("id", station.provinceId())
				.addValue("name", station.province()))
			.toArray(SqlParameterSource[]::new);
		this.jdbc.batchUpdate(UPSERT_PROVINCE, batch);
	}

}
