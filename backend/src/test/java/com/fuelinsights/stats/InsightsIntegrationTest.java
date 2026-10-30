package com.fuelinsights.stats;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

import com.fuelinsights.TestcontainersConfiguration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** The statistics tab over data written directly, so each rule is visible in the numbers. */
@SpringBootTest(properties = "fuel-insights.import.cron=-")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class InsightsIntegrationTest {

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JdbcClient jdbc;

	@BeforeEach
	void emptyDatabase() {
		this.jdbc.sql("""
				truncate price_current, station_current, current_snapshot, import_day, price_stats_daily, price_daily,
					station, province cascade
				""").update();
		this.jdbc.sql("insert into province (id, name) values ('08', 'BARCELONA'), ('28', 'MADRID')").update();
		this.jdbc.sql("""
				insert into current_snapshot (published_at, imported_at, stations, prices)
				values ('2026-10-29T13:45:09+01:00', now(), 1, 1)
				""").update();
	}

	@Test
	void weekdayDeviationTakesTheTrendOutAndOnlyCountsDaysWithAWholeWeekAround() {
		// Four weeks of prices rising a tenth of a cent a day, with every Monday one cent below its trend.
		LocalDate first = LocalDate.of(2026, 9, 28);
		for (int i = 0; i < 28; i++) {
			LocalDate day = first.plusDays(i);
			double price = 1.800 + 0.001 * i - ((day.getDayOfWeek() == DayOfWeek.MONDAY) ? 0.010 : 0);
			publishedDay(day, BigDecimal.valueOf(price));
		}

		assertThat(this.mvc.get().uri("/api/stats/weekdays?fuel=GASOLEO_A")).hasStatusOk()
			.bodyJson()
			.isLenientlyEqualTo("""
					{"from": "2026-10-01", "to": "2026-10-22",
					 "weekdays": [{"weekday": 1, "days": 3}, {"weekday": 2}, {"weekday": 3}, {"weekday": 4},
						{"weekday": 5}, {"weekday": 6}, {"weekday": 7}]}
					""");
		assertThat(this.mvc.get().uri("/api/stats/weekdays?fuel=GASOLEO_A")).bodyJson()
			.extractingPath("$.weekdays[0].deviation")
			.asNumber()
			.satisfies((deviation) -> assertThat(deviation.doubleValue()).isCloseTo(-0.00857, within(0.00001)));
	}

	@Test
	void weekdaysNeedPublishedDays() {
		assertThat(this.mvc.get().uri("/api/stats/weekdays?fuel=GASOLEO_A")).hasStatus(HttpStatus.NOT_FOUND);
	}

	@Test
	void spreadComparesOneOfTheCheapWithOneOfTheDearAndPutsTheWidestProvinceFirst() {
		for (int i = 0; i < 11; i++) {
			stationWithPrice(100 + i, "08", "REPSOL", new BigDecimal("1.800").add(new BigDecimal("0.010").multiply(
					BigDecimal.valueOf(i))));
		}
		stationWithPrice(200, "28", "BP", new BigDecimal("1.850"));
		stationWithPrice(201, "28", "BP", new BigDecimal("1.860"));

		assertThat(this.mvc.get().uri("/api/stats/spread?fuel=GASOLEO_A")).hasStatusOk()
			.bodyJson()
			.isLenientlyEqualTo("""
					{"updatedAt": "2026-10-29T13:45:09+01:00",
					 "spain": {"provinceId": null, "stations": 13},
					 "provinces": [
						{"provinceId": "08", "cheapPrice": 1.810, "medianPrice": 1.850, "dearPrice": 1.890,
							"minPrice": 1.800, "maxPrice": 1.900, "stations": 11},
						{"provinceId": "28", "cheapPrice": 1.851, "dearPrice": 1.859, "stations": 2}]}
					""");
	}

	@Test
	void brandsNeedFiftyStationsAndRankCheapestFirst() {
		for (int i = 0; i < 50; i++) {
			stationWithPrice(1000 + i, "08", "REPSOL", new BigDecimal("1.900"));
			stationWithPrice(2000 + i, "28", "BALLENOIL", new BigDecimal("1.700"));
		}
		stationWithPrice(3000, "28", "TINY", new BigDecimal("1.500"));

		assertThat(this.mvc.get().uri("/api/stats/brands?fuel=GASOLEO_A")).hasStatusOk()
			.bodyJson()
			.isLenientlyEqualTo("""
					{"nationalAverage": 1.797,
					 "brands": [
						{"code": "BALLENOIL", "name": "Ballenoil", "averagePrice": 1.700, "stations": 50},
						{"code": "REPSOL", "name": "Repsol", "averagePrice": 1.900, "stations": 50}]}
					""");
		assertThat(this.mvc.get().uri("/api/stats/brands?fuel=GASOLEO_A")).bodyJson()
			.extractingPath("$.brands")
			.asArray()
			.hasSize(2);
	}

	@Test
	void brandCodesReadAsTheBrandsWriteThemselves() {
		assertThat(InsightsService.brandName("REPSOL")).isEqualTo("Repsol");
		assertThat(InsightsService.brandName("BP")).isEqualTo("BP");
		assertThat(InsightsService.brandName("INDEPENDENT")).isEqualTo("Sin marca");
	}

	private void publishedDay(LocalDate day, BigDecimal price) {
		this.jdbc.sql("""
				insert into import_day (day, stations, prices, status, started_at, finished_at, published_at)
				values (:day, 1, 1, 'COMPLETED', now(), now(), now())
				""").param("day", day).update();
		this.jdbc.sql("""
				insert into price_stats_daily (day, fuel, area, average_price, min_price, max_price, median_price,
					stations)
				values (:day, 'GASOLEO_A', 'ES', :price, :price, :price, :price, 1)
				""").param("day", day).param("price", price).update();
	}

	private void stationWithPrice(int id, String province, String brand, BigDecimal price) {
		this.jdbc.sql("""
				insert into station (id, brand_raw, brand, municipality, province_id, latitude, longitude, first_seen,
					last_seen)
				values (:id, :brand, :brand, 'Town', :province, 40.0, -3.0, date '2026-01-01', date '2026-10-28')
				""").param("id", id).param("brand", brand).param("province", province).update();
		this.jdbc.sql("insert into price_current (station_id, fuel, price) values (:id, 'GASOLEO_A', :price)")
			.param("id", id)
			.param("price", price)
			.update();
	}

}
