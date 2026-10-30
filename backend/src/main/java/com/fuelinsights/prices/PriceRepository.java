package com.fuelinsights.prices;

import java.time.LocalDate;
import java.util.List;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;

/** Writes daily prices in JDBC batches. */
@Repository
public class PriceRepository {

	// Upsert rather than plain insert: a station listed twice in the source must not fail the whole day.
	private static final String UPSERT = """
			insert into price_daily (day, station_id, province_id, fuel, price)
			values (:day, :stationId, :provinceId, :fuel, :price)
			on conflict (day, station_id, fuel) do update set
				price = excluded.price, province_id = excluded.province_id
			""";

	private final NamedParameterJdbcTemplate jdbc;

	public PriceRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** Removes the day before it is loaded again, so a price the Ministry no longer publishes does not survive. */
	public void deleteDay(LocalDate day) {
		this.jdbc.update("delete from price_daily where day = :day", new MapSqlParameterSource("day", day));
	}

	public void upsertAll(LocalDate day, List<DailyPrice> prices) {
		SqlParameterSource[] batch = prices.stream()
			.map((price) -> new MapSqlParameterSource()
				.addValue("day", day)
				.addValue("stationId", price.stationId())
				.addValue("provinceId", price.provinceId())
				.addValue("fuel", price.fuel().name())
				.addValue("price", price.price()))
			.toArray(SqlParameterSource[]::new);
		this.jdbc.batchUpdate(UPSERT, batch);
	}

}
