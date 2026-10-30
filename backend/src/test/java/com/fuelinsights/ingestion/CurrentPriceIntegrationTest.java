package com.fuelinsights.ingestion;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import javax.sql.DataSource;

import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import com.fuelinsights.TestcontainersConfiguration;
import com.fuelinsights.ingestion.CurrentPriceImporter.Outcome;
import com.fuelinsights.prices.Fuel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

/** The current prices against a real PostgreSQL: import, replacement, lock and the read API. The Ministry is faked. */
@SpringBootTest(properties = "fuel-insights.import.cron=-")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class CurrentPriceIntegrationTest {

	private static final String NOW = "29/10/2026 13:45:09";

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private DataSource dataSource;

	@Autowired
	private CurrentPriceImporter importer;

	@Autowired
	private MeterRegistry meters;

	@MockitoBean
	private MinistryClient ministry;

	@BeforeEach
	void emptyDatabase() {
		this.jdbc.sql("""
				truncate price_current, station_current, current_snapshot, import_day, price_stats_daily, price_daily,
					station, province cascade
				""").update();
	}

	@Test
	void listIsImportedWithTheMinistryTime() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));

		assertThat(this.importer.refresh()).isEqualTo(Outcome.UPDATED);

		// Every fuel comes, in the order of the Fuel enum, the four main ones first: the web relies on it.
		assertThat(this.mvc.get().uri("/api/stats/current")).bodyJson()
			.extractingPath("$.fuels[*].fuel.code")
			.asArray()
			.hasSize(Fuel.values().length)
			.startsWith("GASOLEO_A", "GASOLINA_95_E5", "GASOLEO_PREMIUM", "GASOLINA_98_E5");
		assertThat(this.mvc.get().uri("/api/stats/current")).hasStatusOk()
			.bodyJson()
			.isLenientlyEqualTo("""
					{"updatedAt": "2026-10-29T13:45:09+01:00"}
					""");
		MvcTestResult current = this.mvc.get().uri("/api/stats/current").exchange();
		assertThat(current).bodyJson()
			.extractingPath("$.fuels[0].fuel")
			.isEqualTo(Map.of("code", "GASOLEO_A", "name", "Gasóleo A", "shortName", "Diésel", "unit", "l", "main", true));
		assertThat(current).bodyJson().extractingPath("$.fuels[0].averagePrice").isEqualTo(1.929);
		assertThat(current).bodyJson().extractingPath("$.fuels[0].medianPrice").isEqualTo(1.949);
		assertThat(current).bodyJson().extractingPath("$.fuels[0].stations").isEqualTo(3);
		assertThat(current).bodyJson()
			.extractingPath("$.fuels[0].provinces")
			.isEqualTo(List.of(Map.of("provinceId", "08", "averagePrice", 1.914, "stations", 2),
					Map.of("provinceId", "15", "averagePrice", 1.959, "stations", 1)));
	}

	@Test
	void listAlreadyImportedIsNotWrittenAgain() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();
		Instant firstImport = importedAt();

		assertThat(this.importer.refresh()).isEqualTo(Outcome.UNCHANGED);

		assertThat(importedAt()).isEqualTo(firstImport);
	}

	@Test
	void olderListDownloadedLateNeverReplacesANewerOne() {
		// Another instance stored the 14:15 list while this one was still downloading the 13:45 one.
		given(this.ministry.fetchCurrent()).willReturn(list("29/10/2026 14:15:09", List.of(sampleStations().get(0))))
			.willReturn(list(NOW, sampleStations()));
		this.importer.refresh();

		assertThat(this.importer.refresh()).isEqualTo(Outcome.UNCHANGED);

		assertThat(this.jdbc.sql("select distinct station_id from price_current").query(Integer.class).list())
			.containsExactly(8329);
	}

	@Test
	void newListReplacesTheOldOneEntirely() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()))
			.willReturn(list("29/10/2026 14:15:09", List.of(sampleStations().get(0))));
		this.importer.refresh();

		this.importer.refresh();

		assertThat(this.jdbc.sql("select distinct station_id from price_current").query(Integer.class).list())
			.containsExactly(8329);
		assertThat(this.jdbc.sql("select count(*) from station_current").query(Integer.class).single()).isOne();
	}

	@Test
	void knownStationKeepsTheDetailsOfTheDailyImport() {
		insertStation(8329, "OLD ADDRESS");
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));

		this.importer.refresh();

		assertThat(addressOf(8329)).isEqualTo("OLD ADDRESS");
		assertThat(this.jdbc.sql("select brand from station where id = 8329").query(String.class).single())
			.isEqualTo("REPSOL");
	}

	@Test
	void unknownStationIsAddedToTheCatalogWithANormalisedBrand() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));

		this.importer.refresh();

		assertThat(this.jdbc.sql("select brand from station where id = 8329").query(String.class).single())
			.isEqualTo("BP");
	}

	@Test
	void listIsSkippedWhileAnotherInstanceImportsIt() throws Exception {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		// A transaction-scoped lock on another connection, released by the rollback: a session lock would stay held
		// by the pooled connection after the test and could make a later import look busy.
		try (Connection other = this.dataSource.getConnection()) {
			other.setAutoCommit(false);
			try (PreparedStatement lock = other.prepareStatement("select pg_advisory_xact_lock(?)")) {
				lock.setLong(1, CurrentPriceImporter.LOCK_KEY);
				lock.execute();

				assertThat(this.importer.refresh()).isEqualTo(Outcome.BUSY);
			}
			finally {
				other.rollback();
				other.setAutoCommit(true);
			}
		}
		assertThat(this.jdbc.sql("select count(*) from current_snapshot").query(Integer.class).single()).isZero();
	}

	@Test
	void mapGetsEveryStationSellingTheFuelAsShortArrays() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();

		assertThat(this.mvc.get().uri("/api/stations?fuel=GASOLINA_98_E5")).hasStatusOk()
			.bodyJson()
			.isStrictlyEqualTo("""
					{
						"fuel": {"code": "GASOLINA_98_E5", "name": "Gasolina 98 E5", "shortName": "Gasolina 98", "unit": "l",
							"main": true},
						"updatedAt": "2026-10-29T13:45:09+01:00",
						"stations": [[8329, 41.481083, 2.304528, 1.989]]
					}
					""");
	}

	@Test
	void boardForTheMapBoxHasTheCheapestPriceAndTheAverage() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();

		assertThat(this.mvc.get().uri("/api/stats/zone?west=2&south=41&east=3&north=42")).hasStatusOk()
			.bodyJson()
			.isLenientlyEqualTo("""
					{
						"updatedAt": "2026-10-29T13:45:09+01:00",
						"weekAgo": null,
						"fuels": [
							{"fuel": {"code": "GASOLEO_A"}, "minPrice": 1.879, "averagePrice": 1.914, "stations": 2,
								"weekAgoAverage": null},
							{"fuel": {"code": "GASOLINA_95_E5"}, "minPrice": 1.769, "stations": 2},
							{"fuel": {"code": "GASOLEO_PREMIUM"}, "minPrice": 1.899, "stations": 2},
							{"fuel": {"code": "GASOLINA_98_E5"}, "minPrice": 1.989, "stations": 1}
						]
					}
					""");
	}

	@Test
	void boardForTheSearchCircleCountsOnlyStationsInsideIt() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();

		// Mataró is about 13 km from Alella, so a 5 km circle holds Alella alone.
		MvcTestResult zone = this.mvc.get().uri("/api/stats/zone?latitude=41.481083&longitude=2.304528&radius=5").exchange();
		assertThat(zone).bodyJson().extractingPath("$.fuels[0].minPrice").isEqualTo(1.949);
		assertThat(zone).bodyJson().extractingPath("$.fuels[0].stations").isEqualTo(1);
	}

	@Test
	void boardForAProvinceCountsItsStations() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();

		assertThat(this.mvc.get().uri("/api/stats/zone?province=15")).bodyJson()
			.extractingPath("$.fuels[*].stations")
			.isEqualTo(List.of(1, 1));
	}

	@Test
	void weekChangeComparesTheZoneWithItselfSevenDaysBefore() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();
		dailyPrice(LocalDate.of(2026, 10, 22), "COMPLETED", "1.999");

		MvcTestResult zone = this.mvc.get().uri("/api/stats/zone?west=2&south=41&east=3&north=42").exchange();
		assertThat(zone).bodyJson().extractingPath("$.weekAgo").isEqualTo("2026-10-22");
		assertThat(zone).bodyJson().extractingPath("$.fuels[0].weekAgoAverage").isEqualTo(1.999);
	}

	@Test
	void weekChangeIgnoresADayBeingReimported() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();
		dailyPrice(LocalDate.of(2026, 10, 22), "RUNNING", "1.999");

		assertThat(this.mvc.get().uri("/api/stats/zone?west=2&south=41&east=3&north=42")).bodyJson()
			.extractingPath("$.weekAgo")
			.isNull();
	}

	@Test
	void zoneMustBeExactlyOneKind() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();

		assertThat(this.mvc.get().uri("/api/stats/zone?province=08&latitude=41&longitude=2&radius=5")).hasStatus(400);
		assertThat(this.mvc.get().uri("/api/stats/zone?latitude=41&longitude=2&radius=0")).hasStatus(400);
		assertThat(this.mvc.get().uri("/api/stats/zone?province=8")).hasStatus(400);
		assertThat(this.mvc.get().uri("/api/stats/zone?west=3&south=41&east=2&north=42")).hasStatus(400);
		assertThat(this.mvc.get().uri("/api/stats/zone")).hasStatus(400);
	}

	@Test
	void stationCardHasItsPricesHoursAndOnlyCompletedHistory() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();
		dailyPrice(LocalDate.of(2026, 10, 27), "COMPLETED", "1.939");
		// Being re-imported: still published (its aggregates are whole), but its raw prices may be half loaded.
		dailyPrice(LocalDate.of(2026, 10, 28), "RUNNING", "1.945");

		assertThat(this.mvc.get().uri("/api/stations/8329")).hasStatusOk()
			.bodyJson()
			.isLenientlyEqualTo("""
					{
						"id": 8329, "name": "BP ALELLA", "municipality": "Alella", "province": "BARCELONA",
						"schedule": "L-D: 24H", "updatedAt": "2026-10-29T13:45:09+01:00",
						"prices": [
							{"fuel": {"code": "GASOLEO_A"}, "price": 1.949},
							{"fuel": {"code": "GASOLINA_95_E5"}, "price": 1.849},
							{"fuel": {"code": "GASOLEO_PREMIUM"}, "price": 2.039},
							{"fuel": {"code": "GASOLINA_98_E5"}, "price": 1.989}
						],
						"history": [{"fuel": "GASOLEO_A", "points": [{"date": "2026-10-27", "price": 1.939}]}]
					}
					""");
	}

	@Test
	void currentPricesAreComparedWithTheLatestAndTheHighestPublishedDay() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();
		publishNationalAverage(LocalDate.of(2026, 6, 14), "1.962");
		publishNationalAverage(LocalDate.of(2026, 10, 28), "1.931");

		assertThat(this.mvc.get().uri("/api/stats/current")).bodyJson()
			.extractingPath("$.fuels[0].yesterday")
			.isEqualTo(Map.of("date", "2026-10-28", "averagePrice", 1.931));
		assertThat(this.mvc.get().uri("/api/stats/current")).bodyJson()
			.extractingPath("$.fuels[0].maxDaily")
			.isEqualTo(Map.of("date", "2026-06-14", "averagePrice", 1.962));
	}

	@Test
	void sameDataIsNotSentTwice() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();
		MvcTestResult first = this.mvc.get().uri("/api/stations?fuel=GASOLEO_A").exchange();
		String etag = first.getResponse().getHeader("ETag");

		assertThat(first).hasStatusOk().hasHeader("Cache-Control", "max-age=300, public");
		assertThat(this.mvc.get().uri("/api/stations?fuel=GASOLEO_A").header("If-None-Match", etag)).hasStatus(304);
	}

	@Test
	void newListChangesTheVersionOfTheData() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()))
			.willReturn(list("29/10/2026 14:15:09", sampleStations()));
		this.importer.refresh();
		String etag = this.mvc.get().uri("/api/stats/current").exchange().getResponse().getHeader("ETag");

		this.importer.refresh();

		assertThat(this.mvc.get().uri("/api/stats/current").header("If-None-Match", etag)).hasStatusOk();
	}

	@Test
	void oldDayCompletedLaterChangesTheVersionOfTheData() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();
		String zone = "/api/stats/zone?west=2&south=41&east=3&north=42";
		dailyPrice(LocalDate.of(2026, 10, 22), "RUNNING", "1.999");
		String running = this.mvc.get().uri(zone).exchange().getResponse().getHeader("ETag");

		// A backfill finishes the day a week ago: the week change appears without a new current list.
		this.jdbc.sql("""
				update import_day set status = 'COMPLETED', finished_at = now() + interval '1 second',
					published_at = now() + interval '1 second'
				where day = '2026-10-22'
				""").update();

		assertThat(this.mvc.get().uri(zone).header("If-None-Match", running)).hasStatusOk()
			.bodyJson()
			.extractingPath("$.fuels[0].weekAgoAverage")
			.isEqualTo(1.999);
	}

	@Test
	void currentApiIsNotFoundBeforeTheFirstList() {
		assertThat(this.mvc.get().uri("/api/stats/current")).hasStatus(404);
		assertThat(this.mvc.get().uri("/api/stations?fuel=GASOLEO_A")).hasStatus(404);
	}

	@Test
	void summariesGiveTheNamesOfSeveralStationsInOneRequestLeavingOutUnknownOnes() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();

		assertThat(this.mvc.get().uri("/api/stations/summaries?ids=15321,8329,1")).hasStatusOk()
			.bodyJson()
			.isStrictlyEqualTo("""
					[
						{"id": 8329, "name": "BP ALELLA", "municipality": "Alella",
							"openingHours": [[["00:00", "24:00"]], [["00:00", "24:00"]], [["00:00", "24:00"]],
								[["00:00", "24:00"]], [["00:00", "24:00"]], [["00:00", "24:00"]], [["00:00", "24:00"]]]},
						{"id": 15321, "name": "CLUN", "municipality": "Ames", "openingHours": null}
					]
					""");
	}

	@Test
	void stationCardReadsTheOpeningHoursAndNamesTheProvince() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();

		assertThat(this.mvc.get().uri("/api/stations/1736")).hasStatusOk()
			.bodyJson()
			.isLenientlyEqualTo("""
					{
						"provinceId": "08", "schedule": "L-S: 06:00-22:00",
						"openingHours": [[["06:00", "22:00"]], [["06:00", "22:00"]], [["06:00", "22:00"]],
							[["06:00", "22:00"]], [["06:00", "22:00"]], [["06:00", "22:00"]], []]
					}
					""");
	}

	@Test
	void placesAreTheTownsWithAStationNowSortedByNameAndCachedForAnHour() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();

		MvcTestResult places = this.mvc.get().uri("/api/places").exchange();

		assertThat(places).hasStatusOk().hasHeader("Cache-Control", "max-age=3600");
		assertThat(places).bodyJson().extractingPath("$[*][0]").asArray().containsExactly("Alella", "Ames", "Mataró");
		assertThat(places).bodyJson().extractingPath("$[0]").asArray().containsExactly("Alella", "08", 41.48108,
				2.30453, 1);
	}

	@Test
	void townReadsTheSameInTheSearchTheListsAndTheCard() {
		MinistryStation lasRozas = station("28001", "GALP", "Rozas de Madrid (Las)", "28", "MADRID", "40,49", "-3,87",
				"2,019", "", "", "", null);
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, List.of(lasRozas)));
		this.importer.refresh();

		assertThat(this.mvc.get().uri("/api/places")).bodyJson().extractingPath("$[0][0]")
			.isEqualTo("Las Rozas de Madrid");
		assertThat(this.mvc.get().uri("/api/stations/summaries?ids=28001")).bodyJson()
			.extractingPath("$[0].municipality")
			.isEqualTo("Las Rozas de Madrid");
		assertThat(this.mvc.get().uri("/api/stations/28001")).bodyJson()
			.extractingPath("$.municipality")
			.isEqualTo("Las Rozas de Madrid");
	}

	@Test
	void fuelSoldByTheKiloIsImportedAndNamesItsUnit() {
		Map<String, String> fields = new HashMap<>(MinistryFields.prices("1,899", "", "", ""));
		fields.put(Fuel.GNC.ministryField(), "1,958");
		MinistryStation gas = new MinistryStation("1", "GNC MADRID", null, "Madrid", "28", "MADRID", null, "40,4",
				"-3,7", null, fields);
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, List.of(gas)));

		this.importer.refresh();

		assertThat(this.mvc.get().uri("/api/stations?fuel=GNC")).bodyJson()
			.isLenientlyEqualTo("""
					{"fuel": {"code": "GNC", "unit": "kg", "main": false}, "stations": [[1, 40.4, -3.7, 1.958]]}
					""");
		assertThat(this.mvc.get().uri("/api/fuels")).bodyJson()
			.extractingPath("$[?(@.main == true)].code")
			.asArray()
			.containsExactly("GASOLEO_A", "GASOLINA_95_E5", "GASOLEO_PREMIUM", "GASOLINA_98_E5");
	}

	@Test
	void townAveragesAreForTheChosenFuel() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();

		assertThat(this.mvc.get().uri("/api/stats/municipalities?fuel=GASOLINA_95_E5")).bodyJson()
			.isLenientlyEqualTo("""
					[["Alella", "08", 1.849, 1], ["Mataró", "08", 1.769, 1], ["Ames", "15", 1.819, 1]]
					""");
	}

	@Test
	void summariesOfMoreThanFiftyStationsAreABadRequest() {
		String ids = String.join(",", IntStream.rangeClosed(1, 51).mapToObj(String::valueOf).toList());

		assertThat(this.mvc.get().uri("/api/stations/summaries?ids=" + ids)).hasStatus(400);
	}

	@Test
	void unknownStationIsNotFound() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();

		assertThat(this.mvc.get().uri("/api/stations/1")).hasStatus(404);
	}

	@Test
	void currentAgeCountsTheMinutesSinceTheMinistryTime() {
		given(this.ministry.fetchCurrent()).willReturn(list(NOW, sampleStations()));
		this.importer.refresh();

		// The clock below says 14:00 in Madrid; the list is from 13:45:09.
		assertThat(this.meters.get("fuel_insights.current.age").gauge().value()).isEqualTo(14.0);
	}

	@TestConfiguration(proxyBeanMethods = false)
	static class Now {

		@Bean
		@Primary
		Clock fixedClock() {
			return Clock.fixed(Instant.parse("2026-10-29T13:00:00Z"), ZoneId.of("Europe/Madrid"));
		}

	}

	private static MinistryCurrentResponse list(String date, List<MinistryStation> stations) {
		return new MinistryCurrentResponse(date, "OK", stations);
	}

	private static List<MinistryStation> sampleStations() {
		return List.of(
				station("8329", "BP ALELLA", "Alella", "08", "BARCELONA", "41,481083", "2,304528", "1,949", "1,849",
						"2,039", "1,989", "L-D: 24H"),
				station("1736", "NIEVES", "Mataró", "08", "BARCELONA", "41,54", "2,44", "1,879", "1,769", "1,899", "",
						"L-S: 06:00-22:00"),
				station("15321", "CLUN", "Ames", "15", "CORUÑA (A)", "42,895278", "-8,7025", "1,959", "1,819", "", "",
						null));
	}

	private static MinistryStation station(String id, String brand, String municipality, String provinceId,
			String province, String latitude, String longitude, String gasoleoA, String gasolina95,
			String gasoleoPremium, String gasolina98, String schedule) {
		return new MinistryStation(id, brand, "NEW ADDRESS", municipality, provinceId, province, "08328", latitude,
				longitude, schedule, MinistryFields.prices(gasoleoA, gasolina95, gasoleoPremium, gasolina98));
	}

	private void insertStation(int id, String address) {
		this.jdbc.sql("insert into province (id, name) values ('08', 'BARCELONA')").update();
		this.jdbc.sql("""
				insert into station (id, brand_raw, brand, address, municipality, province_id, latitude, longitude,
					first_seen, last_seen)
				values (:id, 'REPSOL ALELLA', 'REPSOL', :address, 'Alella', '08', 41.48, 2.30, '2026-10-01', '2026-10-28')
				""").param("id", id).param("address", address).update();
	}

	private void dailyPrice(LocalDate day, String status, String price) {
		this.jdbc.sql("""
				insert into import_day (day, status, started_at, finished_at, published_at)
				values (:day, :status, now(), now(), now())
				""").param("day", day).param("status", status).update();
		this.jdbc.sql("""
				insert into price_daily (day, station_id, province_id, fuel, price)
				values (:day, 8329, '08', 'GASOLEO_A', :price)
				""").param("day", day).param("price", new BigDecimal(price)).update();
	}

	private void publishNationalAverage(LocalDate day, String averagePrice) {
		this.jdbc.sql("""
				insert into import_day (day, status, started_at, finished_at, published_at)
				values (:day, 'COMPLETED', now(), now(), now())
				""").param("day", day).update();
		this.jdbc.sql("""
				insert into price_stats_daily (day, fuel, area, average_price, min_price, max_price, median_price, stations)
				values (:day, 'GASOLEO_A', 'ES', :price, :price, :price, :price, 100)
				""").param("day", day).param("price", new BigDecimal(averagePrice)).update();
	}

	private Instant importedAt() {
		return this.jdbc.sql("select imported_at from current_snapshot")
			.query((ResultSet rs, int rowNum) -> rs.getObject(1, OffsetDateTime.class).toInstant())
			.single();
	}

	private String addressOf(int id) {
		return this.jdbc.sql("select address from station where id = :id").param("id", id).query(String.class).single();
	}

}
