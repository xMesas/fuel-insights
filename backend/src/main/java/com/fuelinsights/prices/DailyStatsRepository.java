package com.fuelinsights.prices;

import java.time.LocalDate;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Builds the published aggregates of one day: the only numbers the web reads. */
@Repository
public class DailyStatsRepository {

	private final JdbcClient jdbc;

	public DailyStatsRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** Replaces the day's aggregates per province and for Spain ({@code ES}); call it inside a transaction. */
	public void rebuildDay(LocalDate day) {
		this.jdbc.sql("delete from price_stats_daily where day = :day").param("day", day).update();
		this.jdbc.sql("""
				insert into price_stats_daily (day, fuel, area, average_price, min_price, max_price, median_price, stations)
				select day, fuel, province_id, round(avg(price), 3), min(price), max(price),
					round(cast(percentile_cont(0.5) within group (order by price) as numeric), 3), count(*)
				from price_daily
				where day = :day
				group by day, fuel, province_id
				union all
				select day, fuel, 'ES', round(avg(price), 3), min(price), max(price),
					round(cast(percentile_cont(0.5) within group (order by price) as numeric), 3), count(*)
				from price_daily
				where day = :day
				group by day, fuel
				""").param("day", day).update();
	}

}
