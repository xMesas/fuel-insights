package com.fuelinsights.stats;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import com.fuelinsights.prices.Fuel;
import com.fuelinsights.stats.ProvinceStatsResponse.PriceSummary;
import com.fuelinsights.stats.ProvinceStatsResponse.ProvincePrice;
import com.fuelinsights.stats.TrendResponse.TrendPoint;

/** Read-only SQL over the published aggregates ({@code price_stats_daily}); it never reads raw prices. */
@Repository
class StatsRepository {

	private final JdbcClient jdbc;

	StatsRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** The latest published day, or the given one if it was published. */
	Optional<PublishedDay> findPublishedDay(Optional<LocalDate> date) {
		return this.jdbc.sql("""
				select day, published_at from import_day
				where published_at is not null and (cast(:day as date) is null or day = :day)
				order by day desc
				limit 1
				""")
			.param("day", date.orElse(null))
			.query((rs, rowNum) -> new PublishedDay(rs.getObject("day", LocalDate.class),
					rs.getObject("published_at", OffsetDateTime.class).toInstant()))
			.optional();
	}

	PriceSummary national(LocalDate day, Fuel fuel) {
		return this.jdbc.sql("""
				select average_price, median_price, min_price, max_price, stations from price_stats_daily
				where day = :day and fuel = :fuel and area = 'ES'
				""")
			.param("day", day)
			.param("fuel", fuel.name())
			.query(PriceSummary.class)
			.optional()
			.orElseGet(PriceSummary::empty);
	}

	List<ProvincePrice> byProvince(LocalDate day, Fuel fuel) {
		return this.jdbc.sql("""
				select s.area as province_id, p.name as province, s.average_price, s.median_price,
					s.min_price, s.max_price, s.stations
				from price_stats_daily s
				join province p on p.id = s.area
				where s.day = :day and s.fuel = :fuel and s.area <> 'ES'
				order by s.average_price, p.name
				""")
			.param("day", day)
			.param("fuel", fuel.name())
			.query(ProvincePrice.class)
			.list();
	}

	List<AreaView> areas() {
		List<AreaView> areas = new ArrayList<>();
		areas.add(AreaView.SPAIN);
		areas.addAll(this.jdbc.sql("select id, name from province order by id").query(AreaView.class).list());
		return areas;
	}

	Optional<AreaView> findArea(String id) {
		if (AreaView.SPAIN.id().equals(id)) {
			return Optional.of(AreaView.SPAIN);
		}
		return this.jdbc.sql("select id, name from province where id = :id")
			.param("id", id)
			.query(AreaView.class)
			.optional();
	}

	// The window starts 6 days before 'from' so the first points get a full week, and is cut back at the end.
	// RANGE over dates (not ROWS) means a missing day does not stretch the window.
	List<TrendPoint> trend(Fuel fuel, String area, LocalDate from, LocalDate to) {
		return this.jdbc.sql("""
				with days as (
					select cast(d as date) as day
					from generate_series(cast(:from as date) - 6, cast(:to as date), interval '1 day') as d
				),
				series as (
					select days.day, s.average_price, s.median_price, coalesce(s.stations, 0) as stations
					from days
					left join price_stats_daily s on s.day = days.day and s.fuel = :fuel and s.area = :area
				),
				windowed as (
					select day, average_price, median_price, stations,
						avg(average_price) over seven_days as moving_average,
						count(average_price) over seven_days as days_with_data
					from series
					window seven_days as (order by day range between interval '6 days' preceding and current row)
				)
				select day, average_price, median_price, stations,
					case when average_price is null or days_with_data < 4 then null
						else round(moving_average, 3) end as moving_average7
				from windowed
				where day >= :from
				order by day
				""")
			.param("fuel", fuel.name())
			.param("area", area)
			.param("from", from)
			.param("to", to)
			.query((rs, rowNum) -> new TrendPoint(rs.getObject("day", LocalDate.class),
					rs.getBigDecimal("average_price"), rs.getBigDecimal("median_price"),
					rs.getBigDecimal("moving_average7"), rs.getInt("stations")))
			.list();
	}

	record PublishedDay(LocalDate day, Instant publishedAt) {
	}

}
