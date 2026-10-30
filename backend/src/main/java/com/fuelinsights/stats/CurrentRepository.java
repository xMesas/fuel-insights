package com.fuelinsights.stats;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import com.fuelinsights.prices.Fuel;
import com.fuelinsights.stats.CurrentStatsResponse.DailyAverage;
import com.fuelinsights.stats.CurrentStatsResponse.ProvinceAverage;
import com.fuelinsights.stats.StationResponse.HistoryPoint;
import com.fuelinsights.stats.StationsResponse.MapStation;

/** Read-only SQL over the current snapshot, plus the published daily figures it is compared with. */
@Repository
class CurrentRepository {

	private final JdbcClient jdbc;

	CurrentRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	List<FuelFigures> fuelFigures() {
		return this.jdbc.sql("""
				select fuel, round(avg(price), 3) as average_price,
					round(cast(percentile_cont(0.5) within group (order by price) as numeric), 3) as median_price,
					min(price) as min_price, max(price) as max_price, count(*) as stations
				from price_current
				group by fuel
				""")
			.query(FuelFigures.class)
			.list();
	}

	/** The cheapest price, the average and the stations of each fuel inside a zone, now. */
	List<ZoneFigures> zoneFigures(Zone zone) {
		return this.jdbc.sql("""
				select p.fuel, min(p.price) as min_price, round(avg(p.price), 3) as average_price, count(*) as stations
				from price_current p
				join station s on s.id = p.station_id
				where %s
				group by p.fuel
				""".formatted(zone.condition()))
			.params(zone.parameters())
			.query(ZoneFigures.class)
			.list();
	}

	/** The average of each fuel inside a zone on one day, only if that day is completely imported. */
	List<FuelDay> zoneAverages(LocalDate day, Zone zone) {
		return this.jdbc.sql("""
				select p.fuel, p.day, round(avg(p.price), 3) as average_price
				from price_daily p
				join import_day d on d.day = p.day and d.status = 'COMPLETED'
				join station s on s.id = p.station_id
				where p.day = :day and %s
				group by p.fuel, p.day
				""".formatted(zone.condition()))
			.param("day", day)
			.params(zone.parameters())
			.query(FuelDay.class)
			.list();
	}

	List<FuelProvince> provinces() {
		return this.jdbc.sql("""
				select p.fuel, s.province_id, round(avg(p.price), 3) as average_price, count(*) as stations
				from price_current p
				join station s on s.id = p.station_id
				group by p.fuel, s.province_id
				order by p.fuel, average_price, s.province_id
				""")
			.query(FuelProvince.class)
			.list();
	}

	/** The national average of each fuel on the latest published day. */
	List<FuelDay> latestDay() {
		return this.jdbc.sql("""
				select s.fuel, s.day, s.average_price
				from price_stats_daily s
				where s.area = 'ES'
					and s.day = (select max(day) from import_day where published_at is not null)
				""")
			.query(FuelDay.class)
			.list();
	}

	/** The highest national average of each fuel over the published history; the latest day wins a tie. */
	List<FuelDay> highestDay() {
		return this.jdbc.sql("""
				select distinct on (s.fuel) s.fuel, s.day, s.average_price
				from price_stats_daily s
				join import_day d on d.day = s.day and d.published_at is not null
				where s.area = 'ES'
				order by s.fuel, s.average_price desc, s.day desc
				""")
			.query(FuelDay.class)
			.list();
	}

	List<MapStation> mapStations(Fuel fuel) {
		return this.jdbc.sql("""
				select p.station_id as id, s.latitude, s.longitude, p.price
				from price_current p
				join station s on s.id = p.station_id
				where p.fuel = :fuel and s.latitude is not null and s.longitude is not null
				order by p.station_id
				""")
			.param("fuel", fuel.name())
			.query(MapStation.class)
			.list();
	}

	Optional<StationDetails> station(int id) {
		return this.jdbc.sql("""
				select s.id, s.brand_raw as name, s.address, s.municipality, s.province_id, pr.name as province,
					s.postal_code,
					s.latitude, s.longitude, c.schedule
				from station s
				join province pr on pr.id = s.province_id
				left join station_current c on c.station_id = s.id
				where s.id = :id
				""")
			.param("id", id)
			.query(StationDetails.class)
			.optional();
	}

	/** The current average of one fuel in every town that sells it. */
	List<MunicipalityPrice> municipalities(Fuel fuel) {
		return this.jdbc.sql("""
				select s.municipality as name, s.province_id, round(avg(p.price), 3) as average_price,
					count(*) as stations
				from price_current p
				join station s on s.id = p.station_id
				where p.fuel = :fuel and s.municipality is not null
				group by s.municipality, s.province_id
				""")
			.param("fuel", fuel.name())
			.query(MunicipalityPrice.class)
			.list();
	}

	/** Every town with a station selling now, at the average position of those stations. */
	List<Place> places() {
		return this.jdbc.sql("""
				select s.municipality as name, s.province_id, round(avg(s.latitude), 5) as latitude,
					round(avg(s.longitude), 5) as longitude, count(*) as stations
				from station s
				where s.municipality is not null and s.latitude is not null and s.longitude is not null
					and exists (select 1 from price_current p where p.station_id = s.id)
				group by s.municipality, s.province_id
				""")
			.query(Place.class)
			.list();
	}

	List<SummaryRow> summaries(List<Integer> ids) {
		return this.jdbc.sql("""
				select s.id, s.brand_raw as name, s.municipality, c.schedule
				from station s
				left join station_current c on c.station_id = s.id
				where s.id in (:ids)
				order by s.id
				""")
			.param("ids", ids)
			.query(SummaryRow.class)
			.list();
	}

	List<FuelPrice> currentPrices(int stationId) {
		return this.jdbc.sql("select fuel, price from price_current where station_id = :id")
			.param("id", stationId)
			.query(FuelPrice.class)
			.list();
	}

	/**
	 * The station's raw prices on the completed days of the 30 that end on the latest completed day. Only
	 * COMPLETED: a re-import keeps {@code published_at} while it deletes and reloads the day chunk by chunk, so a
	 * RUNNING or FAILED day can be half loaded here even though its published aggregates are still whole.
	 */
	List<FuelHistoryRow> history(int stationId) {
		return this.jdbc.sql("""
				select p.fuel, p.day, p.price
				from price_daily p
				join import_day d on d.day = p.day and d.status = 'COMPLETED'
				where p.station_id = :id
					and p.day > (select max(day) from import_day where status = 'COMPLETED') - 30
				order by p.fuel, p.day
				""")
			.param("id", stationId)
			.query(FuelHistoryRow.class)
			.list();
	}

	record FuelFigures(String fuel, BigDecimal averagePrice, BigDecimal medianPrice, BigDecimal minPrice,
			BigDecimal maxPrice, int stations) {
	}

	record ZoneFigures(String fuel, BigDecimal minPrice, BigDecimal averagePrice, int stations) {
	}

	record FuelProvince(String fuel, String provinceId, BigDecimal averagePrice, int stations) {

		ProvinceAverage toView() {
			return new ProvinceAverage(this.provinceId, this.averagePrice, this.stations);
		}

	}

	record FuelDay(String fuel, LocalDate day, BigDecimal averagePrice) {

		DailyAverage toView() {
			return new DailyAverage(this.day, this.averagePrice);
		}

	}

	record SummaryRow(int id, String name, String municipality, String schedule) {
	}

	record StationDetails(int id, String name, String address, String municipality, String provinceId,
			String province, String postalCode, BigDecimal latitude, BigDecimal longitude, String schedule) {
	}

	record FuelPrice(String fuel, BigDecimal price) {
	}

	record FuelHistoryRow(String fuel, LocalDate day, BigDecimal price) {

		HistoryPoint toPoint() {
			return new HistoryPoint(this.day, this.price);
		}

	}

}
