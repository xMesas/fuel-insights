package com.fuelinsights.pages;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import com.fuelinsights.prices.Fuel;

/**
 * Read-only SQL for the search engine pages. An area is Spain ({@code null} province) or one province; daily figures
 * come only from published days, current ones from the Ministry's list in force now.
 */
@Repository
class PagesRepository {

	// Stations closer than this make a station page's "nearby" list.
	private static final double NEARBY_KM = 10;

	private final JdbcClient jdbc;

	PagesRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** Average, cheapest, dearest and stations of each fuel now. */
	List<CurrentFigures> currentFigures(String provinceId) {
		return this.jdbc.sql("""
				select p.fuel, round(avg(p.price), 3) as average_price, min(p.price) as min_price,
					max(p.price) as max_price, count(*) as stations
				from price_current p
				join station s on s.id = p.station_id
				where (cast(:province as text) is null or s.province_id = :province)
				group by p.fuel
				""")
			.param("province", provinceId)
			.query(CurrentFigures.class)
			.list();
	}

	/** The average of each fuel on the latest published day; {@code ES} is Spain. */
	List<FuelDay> latestDay(String area) {
		return this.jdbc.sql("""
				select s.fuel, s.day, s.average_price
				from price_stats_daily s
				where s.area = :area
					and s.day = (select max(day) from import_day where published_at is not null)
				""")
			.param("area", area)
			.query(FuelDay.class)
			.list();
	}

	/** The highest daily average of each fuel over the published history; the latest day wins a tie. */
	List<FuelDay> highestDay(String area) {
		return this.jdbc.sql("""
				select distinct on (s.fuel) s.fuel, s.day, s.average_price
				from price_stats_daily s
				join import_day d on d.day = s.day and d.published_at is not null
				where s.area = :area
				order by s.fuel, s.average_price desc, s.day desc
				""")
			.param("area", area)
			.query(FuelDay.class)
			.list();
	}

	/** The cheapest stations of one fuel now; a tie goes to the lower id so the list is stable. */
	List<RankedStation> cheapest(Fuel fuel, String provinceId, int limit) {
		return this.jdbc.sql("""
				select s.id, s.brand_raw as name, s.municipality, s.province_id, p.price
				from price_current p
				join station s on s.id = p.station_id
				where p.fuel = :fuel and (cast(:province as text) is null or s.province_id = :province)
				order by p.price, s.id
				limit :limit
				""")
			.param("fuel", fuel.name())
			.param("province", provinceId)
			.param("limit", limit)
			.query(RankedStation.class)
			.list();
	}

	/** One fuel now in every province that sells it. */
	List<ProvinceFigures> provinces(Fuel fuel) {
		return this.jdbc.sql("""
				select s.province_id, round(avg(p.price), 3) as average_price, min(p.price) as min_price,
					count(*) as stations
				from price_current p
				join station s on s.id = p.station_id
				where p.fuel = :fuel
				group by s.province_id
				""")
			.param("fuel", fuel.name())
			.query(ProvinceFigures.class)
			.list();
	}

	/** The register names of the towns of a province with a station selling now, and how many there are. */
	List<TownCount> towns(String provinceId) {
		return this.jdbc.sql("""
				select s.municipality as name, count(*) as stations
				from station s
				where s.province_id = :province and s.municipality is not null
					and exists (select 1 from price_current p where p.station_id = s.id)
				group by s.municipality
				""")
			.param("province", provinceId)
			.query(TownCount.class)
			.list();
	}

	/** The stations selling now in some towns of a province, by their register names. */
	List<StationDetails> townStations(String provinceId, List<String> towns) {
		return this.jdbc.sql("""
				select s.id, s.brand_raw as name, s.address, s.municipality, s.province_id, s.latitude, s.longitude,
					c.schedule
				from station s
				left join station_current c on c.station_id = s.id
				where s.province_id = :province and s.municipality in (:towns)
					and exists (select 1 from price_current p where p.station_id = s.id)
				order by s.id
				""")
			.param("province", provinceId)
			.param("towns", towns)
			.query(StationDetails.class)
			.list();
	}

	List<StationPrice> prices(List<Integer> stationIds) {
		return this.jdbc.sql("""
				select station_id, fuel, price
				from price_current
				where station_id in (:ids)
				order by station_id
				""")
			.param("ids", stationIds)
			.query(StationPrice.class)
			.list();
	}

	Optional<StationDetails> station(int id) {
		return this.jdbc.sql("""
				select s.id, s.brand_raw as name, s.address, s.municipality, s.province_id, s.latitude, s.longitude,
					c.schedule
				from station s
				left join station_current c on c.station_id = s.id
				where s.id = :id
				""")
			.param("id", id)
			.query(StationDetails.class)
			.optional();
	}

	/**
	 * The stations selling now within 10 km of a point, nearest first. The box keeps the distance formula to the few
	 * stations around: a tenth of a degree of latitude is about 11 km everywhere, one of longitude shrinks with it.
	 */
	List<NearbyStation> nearby(int id, BigDecimal latitude, BigDecimal longitude, int limit) {
		double latitudeDegrees = NEARBY_KM / 111.0;
		double longitudeDegrees = latitudeDegrees / Math.cos(Math.toRadians(latitude.doubleValue()));
		return this.jdbc.sql("""
				select id, name, municipality, province_id, round(cast(distance_km as numeric), 1) as distance_km
				from (
					select s.id, s.brand_raw as name, s.municipality, s.province_id,
						6371 * 2 * asin(sqrt(
							power(sin(radians(s.latitude - :latitude) / 2), 2)
							+ cos(radians(:latitude)) * cos(radians(s.latitude))
								* power(sin(radians(s.longitude - :longitude) / 2), 2))) as distance_km
					from station s
					where s.id <> :id
						and s.latitude between :latitude - :latitudeDegrees and :latitude + :latitudeDegrees
						and s.longitude between :longitude - :longitudeDegrees and :longitude + :longitudeDegrees
						and exists (select 1 from price_current p where p.station_id = s.id)
				) around
				where distance_km <= :radius
				order by distance_km, id
				limit :limit
				""")
			.param("id", id)
			.param("latitude", latitude)
			.param("longitude", longitude)
			.param("latitudeDegrees", latitudeDegrees)
			.param("longitudeDegrees", longitudeDegrees)
			.param("radius", NEARBY_KM)
			.param("limit", limit)
			.query(NearbyStation.class)
			.list();
	}

	/** Every station selling now, for the sitemap. */
	List<RankedStation> stationsSelling() {
		return this.jdbc.sql("""
				select s.id, s.brand_raw as name, s.municipality, s.province_id, null as price
				from station s
				where exists (select 1 from price_current p where p.station_id = s.id)
				order by s.id
				""")
			.query(RankedStation.class)
			.list();
	}

	record CurrentFigures(String fuel, BigDecimal averagePrice, BigDecimal minPrice, BigDecimal maxPrice,
			int stations) {
	}

	record FuelDay(String fuel, LocalDate day, BigDecimal averagePrice) {
	}

	record RankedStation(int id, String name, String municipality, String provinceId, BigDecimal price) {
	}

	record ProvinceFigures(String provinceId, BigDecimal averagePrice, BigDecimal minPrice, int stations) {
	}

	record TownCount(String name, int stations) {
	}

	record StationDetails(int id, String name, String address, String municipality, String provinceId,
			BigDecimal latitude, BigDecimal longitude, String schedule) {
	}

	record StationPrice(int stationId, String fuel, BigDecimal price) {
	}

	record NearbyStation(int id, String name, String municipality, String provinceId, BigDecimal distanceKm) {
	}

}
