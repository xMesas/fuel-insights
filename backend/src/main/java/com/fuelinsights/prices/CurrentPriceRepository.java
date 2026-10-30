package com.fuelinsights.prices;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;

/** Writes the snapshot of current prices. The caller runs {@link #replace} in one transaction. */
@Repository
public class CurrentPriceRepository {

	private static final String INSERT_PRICE = """
			insert into price_current (station_id, fuel, price) values (:stationId, :fuel, :price)
			on conflict (station_id, fuel) do update set price = excluded.price
			""";

	private static final String INSERT_SCHEDULE = """
			insert into station_current (station_id, schedule) values (:stationId, :schedule)
			on conflict (station_id) do update set schedule = excluded.schedule
			""";

	private static final String UPSERT_SNAPSHOT = """
			insert into current_snapshot (id, published_at, imported_at, stations, prices)
			values (true, :publishedAt, :importedAt, :stations, :prices)
			on conflict (id) do update set published_at = excluded.published_at, imported_at = excluded.imported_at,
				stations = excluded.stations, prices = excluded.prices
			""";

	private final NamedParameterJdbcTemplate jdbc;

	public CurrentPriceRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** The Ministry time of the snapshot stored now, if there is one. */
	public Optional<Instant> publishedAt() {
		return this.jdbc.getJdbcTemplate()
			.query("select published_at from current_snapshot", (rs, rowNum) -> rs.getObject(1, OffsetDateTime.class))
			.stream()
			.findFirst()
			.map(OffsetDateTime::toInstant);
	}

	/**
	 * Replaces the whole snapshot: a price or a station missing from the new list does not survive. Upserts, because
	 * the source can list a station twice.
	 */
	public void replace(Instant publishedAt, Instant importedAt, List<CurrentPrice> prices,
			Map<Integer, String> schedules) {
		this.jdbc.getJdbcTemplate().update("delete from price_current");
		this.jdbc.getJdbcTemplate().update("delete from station_current");
		this.jdbc.batchUpdate(INSERT_PRICE, prices.stream()
			.map((price) -> new MapSqlParameterSource()
				.addValue("stationId", price.stationId())
				.addValue("fuel", price.fuel().name())
				.addValue("price", price.price()))
			.toArray(SqlParameterSource[]::new));
		this.jdbc.batchUpdate(INSERT_SCHEDULE, schedules.entrySet()
			.stream()
			.map((entry) -> new MapSqlParameterSource()
				.addValue("stationId", entry.getKey())
				.addValue("schedule", entry.getValue()))
			.toArray(SqlParameterSource[]::new));
		this.jdbc.update(UPSERT_SNAPSHOT, new MapSqlParameterSource()
			.addValue("publishedAt", publishedAt.atOffset(ZoneOffset.UTC))
			.addValue("importedAt", importedAt.atOffset(ZoneOffset.UTC))
			.addValue("stations", schedules.size())
			.addValue("prices", prices.size()));
	}

}
