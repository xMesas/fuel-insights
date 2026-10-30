package com.fuelinsights.stats;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

import com.fuelinsights.TestcontainersConfiguration;

import static org.assertj.core.api.Assertions.assertThat;

/** The read API over published aggregates, with the aggregates written directly so each rule is visible. */
@SpringBootTest(properties = "fuel-insights.import.cron=-")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class StatsIntegrationTest {

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JdbcClient jdbc;

	@BeforeEach
	void provincesAndNoData() {
		this.jdbc.sql("""
				truncate price_current, station_current, current_snapshot, import_day, price_stats_daily, price_daily,
					station, province cascade
				""").update();
		this.jdbc.sql("insert into province (id, name) values ('08', 'BARCELONA'), ('15', 'CORUÑA (A)')").update();
	}

	@Test
	void trendHasAGapOnADayWithoutDataAndAWeeklyMovingAverageOverDates() {
		// 1 to 10 October, without the 5th; the price grows 0.010 a day from 1.000.
		for (int day = 1; day <= 10; day++) {
			if (day != 5) {
				publish(LocalDate.of(2026, 10, day), "ES", new BigDecimal("1.000").add(new BigDecimal("0.010").multiply(BigDecimal.valueOf(day - 1))));
			}
		}

		assertThat(this.mvc.get().uri("/api/stats/trend?fuel=GASOLEO_A&area=ES&from=2026-10-03&to=2026-10-10"))
			.hasStatusOk()
			.bodyJson()
			.isLenientlyEqualTo("""
					{
						"area": {"id": "ES", "name": "España"},
						"from": "2026-10-03",
						"to": "2026-10-10",
						"points": [
							{"date": "2026-10-03", "averagePrice": 1.020, "movingAverage7": null},
							{"date": "2026-10-04", "averagePrice": 1.030, "movingAverage7": 1.015},
							{"date": "2026-10-05", "averagePrice": null, "movingAverage7": null, "stations": 0},
							{"date": "2026-10-06", "averagePrice": 1.050, "movingAverage7": 1.022},
							{"date": "2026-10-07"},
							{"date": "2026-10-08", "movingAverage7": 1.040},
							{"date": "2026-10-09"},
							{"date": "2026-10-10"}
						]
					}
					""");
	}

	@Test
	void trendWithoutDatesCoversTheYearEndingOnTheLatestPublishedDay() {
		publish(LocalDate.of(2026, 10, 27), "ES", new BigDecimal("1.895"));

		assertThat(this.mvc.get().uri("/api/stats/trend?fuel=GASOLEO_A")).hasStatusOk()
			.bodyJson()
			.satisfies((json) -> assertThat(json).extractingPath("$.from").isEqualTo("2025-10-28"))
			.extractingPath("$.points")
			.asArray()
			.hasSize(365);
	}

	@Test
	void unknownAreaIsABadRequest() {
		publish(LocalDate.of(2026, 10, 27), "ES", new BigDecimal("1.895"));

		assertThat(this.mvc.get().uri("/api/stats/trend?fuel=GASOLEO_A&area=99")).hasStatus(400);
	}

	@Test
	void aggregatesOfADayThatIsNotPublishedAreNotShown() {
		insertAggregate(LocalDate.of(2026, 10, 27), "08", new BigDecimal("1.914"));

		assertThat(this.mvc.get().uri("/api/stats/provinces?fuel=GASOLEO_A")).hasStatus(404);
	}

	@Test
	void areasStartWithSpainFollowedByTheProvinces() {
		assertThat(this.mvc.get().uri("/api/areas")).hasStatusOk()
			.bodyJson()
			.extractingPath("$[*].id")
			.asArray()
			.containsExactly("ES", "08", "15");
	}

	private void publish(LocalDate day, String area, BigDecimal averagePrice) {
		insertAggregate(day, area, averagePrice);
		this.jdbc.sql("""
				insert into import_day (day, status, started_at, finished_at, published_at)
				values (:day, 'COMPLETED', now(), now(), now())
				on conflict (day) do nothing
				""").param("day", day).update();
	}

	private void insertAggregate(LocalDate day, String area, BigDecimal averagePrice) {
		this.jdbc.sql("""
				insert into price_stats_daily (day, fuel, area, average_price, min_price, max_price, median_price, stations)
				values (:day, 'GASOLEO_A', :area, :price, :price, :price, :price, 100)
				""").param("day", day).param("area", area).param("price", averagePrice).update();
	}

}
