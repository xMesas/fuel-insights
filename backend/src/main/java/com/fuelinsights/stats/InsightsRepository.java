package com.fuelinsights.stats;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import com.fuelinsights.prices.Fuel;

/** The SQL behind the statistics tab: questions drivers ask, each answered by one query. */
@Repository
class InsightsRepository {

	private final JdbcClient jdbc;

	InsightsRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/**
	 * How far each weekday's national average sits from the week around it, over the last year of published days.
	 * The centred seven-day average takes the trend out, so a year of rising prices does not make Monday look cheap
	 * only because it comes first; days without a whole week around them are left out.
	 */
	List<WeekdayRow> weekdays(Fuel fuel, int days) {
		return this.jdbc.sql("""
				with published as (
					select s.day, s.average_price
					from price_stats_daily s
					join import_day d on d.day = s.day and d.published_at is not null
					where s.area = 'ES' and s.fuel = :fuel
						and s.day > (select max(day) from import_day where published_at is not null) - :days
				), centred as (
					select day, average_price, avg(average_price) over week as week_average,
						count(*) over week as week_days
					from published
					window week as (order by day range between interval '3 days' preceding
						and interval '3 days' following)
				)
				select cast(extract(isodow from day) as integer) as weekday,
					round(avg(average_price - week_average), 5) as deviation, count(*) as days,
					min(day) as first_day, max(day) as last_day
				from centred
				where week_days = 7
				group by weekday
				order by weekday
				""")
			.param("fuel", fuel.name())
			.param("days", days)
			.query(WeekdayRow.class)
			.list();
	}

	/**
	 * The spread of one fuel's prices now in each province and in Spain ({@code ES}). The 10th and 90th percentiles
	 * stand for "one of the cheap ones" and "one of the dear ones": the single dearest station is often a motorway
	 * one nobody chooses, so the extremes would overstate what choosing saves.
	 */
	List<SpreadRow> spread(Fuel fuel) {
		return this.jdbc.sql("""
				select coalesce(s.province_id, 'ES') as area,
					round(cast(percentile_cont(0.1) within group (order by p.price) as numeric), 3) as cheap_price,
					round(cast(percentile_cont(0.5) within group (order by p.price) as numeric), 3) as median_price,
					round(cast(percentile_cont(0.9) within group (order by p.price) as numeric), 3) as dear_price,
					min(p.price) as min_price, max(p.price) as max_price, count(*) as stations
				from price_current p
				join station s on s.id = p.station_id
				where p.fuel = :fuel
				group by grouping sets ((s.province_id), ())
				""")
			.param("fuel", fuel.name())
			.query(SpreadRow.class)
			.list();
	}

	/** The average of one fuel now by brand, for brands with at least {@code minStations} stations selling it. */
	List<BrandRow> brands(Fuel fuel, int minStations) {
		return this.jdbc.sql("""
				select s.brand, round(avg(p.price), 3) as average_price, min(p.price) as min_price,
					count(*) as stations
				from price_current p
				join station s on s.id = p.station_id
				where p.fuel = :fuel and s.brand is not null
				group by s.brand
				having count(*) >= :minStations
				order by average_price, s.brand
				""")
			.param("fuel", fuel.name())
			.param("minStations", minStations)
			.query(BrandRow.class)
			.list();
	}

	record WeekdayRow(int weekday, BigDecimal deviation, int days, LocalDate firstDay, LocalDate lastDay) {
	}

	record SpreadRow(String area, BigDecimal cheapPrice, BigDecimal medianPrice, BigDecimal dearPrice,
			BigDecimal minPrice, BigDecimal maxPrice, int stations) {
	}

	record BrandRow(String brand, BigDecimal averagePrice, BigDecimal minPrice, int stations) {
	}

}
