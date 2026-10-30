package com.fuelinsights.ingestion;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

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
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import com.fuelinsights.TestcontainersConfiguration;
import com.fuelinsights.prices.DailyStatsRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/** Imports through the HTTP API against a real PostgreSQL; only the Ministry is faked. */
@SpringBootTest(properties = { "fuel-insights.import.cron=-", "fuel-insights.import.pause=0s",
		"fuel-insights.import.catch-up-days=4", "fuel-insights.import.lock-wait=0s" })
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ImportIntegrationTest {

	private static final LocalDate DAY = LocalDate.of(2026, 10, 27);

	private static final LocalDate TODAY = DAY.plusDays(1);

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private DataSource dataSource;

	@Autowired
	private ImportScheduler scheduler;

	@Autowired
	private ImportDayRepository importDays;

	@Autowired
	private MeterRegistry meters;

	@MockitoBean
	private MinistryClient ministry;

	@MockitoSpyBean
	private DailyStatsRepository dailyStats;

	@BeforeEach
	void emptyDatabase() {
		this.jdbc.sql("""
				truncate price_current, station_current, current_snapshot, import_day, price_stats_daily, price_daily,
					station, province, batch_step_execution_context, batch_job_execution_context, batch_step_execution,
					batch_job_execution_params, batch_job_execution, batch_job_instance cascade
				""").update();
	}

	@Test
	void importedDayIsPublishedWithNormalisedBrands() {
		given(this.ministry.fetchStations(DAY)).willReturn(sampleStations("BP ALELLA", "1,949"));

		assertThat(importDay("2026-10-27")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("COMPLETED");

		assertThat(this.mvc.get().uri("/api/stats/provinces?fuel=GASOLEO_A")).hasStatusOk()
			.bodyJson()
			.isLenientlyEqualTo("""
					{
						"date": "2026-10-27",
						"national": {"averagePrice": 1.929, "medianPrice": 1.949, "stations": 3},
						"provinces": [
							{"provinceId": "08", "averagePrice": 1.914, "medianPrice": 1.914, "stations": 2},
							{"provinceId": "15", "averagePrice": 1.959, "stations": 1}
						]
					}
					""");
		assertThat(brandOf(8329)).isEqualTo("BP");
		assertThat(brandOf(1736)).isEqualTo("INDEPENDENT");
	}

	@Test
	void completedDayIsNotDownloadedAgainWithoutForce() {
		given(this.ministry.fetchStations(DAY)).willReturn(sampleStations("BP ALELLA", "1,949"));

		importDay("2026-10-27");
		assertThat(importDay("2026-10-27")).hasStatusOk();

		verify(this.ministry, times(1)).fetchStations(DAY);
	}

	@Test
	void failedChunkLeavesTheDayUnpublishedAndARetryCompletesIt() {
		// 123.456 does not fit numeric(5,3): the database rejects the chunk.
		given(this.ministry.fetchStations(DAY)).willReturn(sampleStations("BP ALELLA", "123,456"),
				sampleStations("BP ALELLA", "1,949"));

		assertThat(importDay("2026-10-27")).hasStatus(500);
		assertThat(statusOf(DAY)).isEqualTo("FAILED");
		assertThat(this.mvc.get().uri("/api/stats/provinces?fuel=GASOLEO_A")).hasStatus(404);

		assertThat(importDay("2026-10-27")).hasStatusOk();
		assertThat(statusOf(DAY)).isEqualTo("COMPLETED");
		assertThat(this.mvc.get().uri("/api/stats/provinces?fuel=GASOLEO_A")).hasStatusOk();
	}

	@Test
	void retryAfterAFailedPublishRebuildsTheWholeDayFromTheNewDownload() {
		willThrow(new IllegalStateException("publish failed")).given(this.dailyStats).rebuildDay(DAY);
		// The second download no longer has the Gasolina 95 price of station 15321.
		given(this.ministry.fetchStations(DAY)).willReturn(sampleStations("BP ALELLA", "1,949"),
				withoutGasolina95Of15321(sampleStations("BP ALELLA", "1,949")));

		assertThat(importDay("2026-10-27")).hasStatus(500);
		doCallRealMethod().when(this.dailyStats).rebuildDay(any());
		assertThat(importDay("2026-10-27")).hasStatusOk();

		assertThat(this.jdbc.sql("select count(*) from price_daily").query(Integer.class).single()).isEqualTo(8);
		assertThat(statusOf(DAY)).isEqualTo("COMPLETED");
	}

	@Test
	void anotherImportHoldingTheLockGivesConflictEvenWithForce() throws Exception {
		try (Connection connection = this.dataSource.getConnection()) {
			holdImportLock(connection);
			try {
				assertThat(importDay("2026-10-27")).hasStatus(409);
				assertThat(this.mvc.post().uri("/api/imports?date=2026-10-27&force=true")).hasStatus(409);
			}
			finally {
				releaseImportLock(connection);
			}
		}
	}

	@Test
	void executionLeftRunningByADeadProcessIsRecovered() {
		given(this.ministry.fetchStations(DAY)).willThrow(new MinistryException(DAY, "down", null))
			.willReturn(sampleStations("BP ALELLA", "1,949"));
		importDay("2026-10-27");
		// What a JVM killed in the middle of the job leaves behind.
		this.jdbc.sql("update batch_job_execution set status = 'STARTED', end_time = null").update();

		assertThat(importDay("2026-10-27")).hasStatusOk();
		assertThat(statusOf(DAY)).isEqualTo("COMPLETED");
	}

	@Test
	void ministryWithoutDataIsABadGatewayAndTheDayIsFailed() {
		given(this.ministry.fetchStations(DAY))
			.willThrow(new MinistryException(DAY, "no stations in the answer", null));

		assertThat(importDay("2026-10-27")).hasStatus(502).bodyJson().extractingPath("$.title")
			.isEqualTo("Ministry API error");
		assertThat(statusOf(DAY)).isEqualTo("FAILED");
	}

	@Test
	void forcedReimportKeepsThePublishedNumbersUntilItPublishes() throws Exception {
		CountDownLatch downloading = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		given(this.ministry.fetchStations(DAY)).willReturn(sampleStations("BP ALELLA", "1,949"))
			.willAnswer((invocation) -> {
				downloading.countDown();
				release.await(10, TimeUnit.SECONDS);
				return sampleStations("BP ALELLA", "1,849");
			});
		importDay("2026-10-27");

		CompletableFuture<MvcTestResult> reimport = CompletableFuture
			.supplyAsync(() -> this.mvc.post().uri("/api/imports?date=2026-10-27&force=true").exchange());
		assertThat(downloading.await(10, TimeUnit.SECONDS)).isTrue();

		// The old prices are already deleted, but the web reads the published aggregates.
		assertThat(nationalAverage()).isEqualTo(1.929);
		assertThat(statusOf(DAY)).isEqualTo("RUNNING");
		assertThat(this.mvc.post().uri("/api/imports?date=2026-10-20")).hasStatus(409);

		release.countDown();
		assertThat(reimport.get(10, TimeUnit.SECONDS)).hasStatusOk();
		assertThat(nationalAverage()).isEqualTo(1.896);
	}

	@Test
	void importThatLostItsLockCannotWriteAfterANewerImportTookOver() throws Exception {
		CountDownLatch downloading = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		given(this.ministry.fetchStations(DAY)).willAnswer((invocation) -> {
			downloading.countDown();
			release.await(10, TimeUnit.SECONDS);
			return sampleStations("STALE", "1,999");
		}).willReturn(sampleStations("BP ALELLA", "1,849"));

		CompletableFuture<MvcTestResult> stale = CompletableFuture.supplyAsync(() -> importDay("2026-10-27"));
		assertThat(downloading.await(10, TimeUnit.SECONDS)).isTrue();
		// PostgreSQL ends only the session that holds the lock; the first import keeps running.
		this.jdbc.sql("""
				select pg_terminate_backend(pid) from pg_locks
				where locktype = 'advisory' and objid = :key and granted
				""").param("key", ImportLock.LOCK_KEY).query(Boolean.class).list();

		assertThat(importDay("2026-10-27")).hasStatusOk();
		release.countDown();

		assertThat(stale.get(10, TimeUnit.SECONDS).getResponse().getStatus()).isGreaterThanOrEqualTo(500);
		assertThat(statusOf(DAY)).isEqualTo("COMPLETED");
		assertThat(brandOf(8329)).isEqualTo("BP");
		assertThat(nationalAverage()).isEqualTo(1.896);
	}

	@Test
	void olderDayKeepsTheProvinceItHadThatDayAndDoesNotOverwriteTheCatalog() {
		LocalDate olderDay = DAY.minusDays(7);
		given(this.ministry.fetchStations(DAY)).willReturn(sampleStations("BP ALELLA", "1,949"));
		// A week earlier, station 1736 was listed in A Coruña and station 8329 had another sign.
		given(this.ministry.fetchStations(olderDay)).willReturn(List.of(
				station("8329", "OLD NAME", "08", "BARCELONA", "1,949", "1,849", "", ""),
				station("1736", "NIEVES", "15", "CORUÑA (A)", "1,879", "1,769", "", "")));

		importDay("2026-10-27");
		importDay("2026-10-20");

		assertThat(this.jdbc.sql("select brand_raw from station where id = 8329").query(String.class).single())
			.isEqualTo("BP ALELLA");
		assertThat(this.jdbc.sql("select province_id from station where id = 1736").query(String.class).single())
			.isEqualTo("08");
		assertThat(this.jdbc.sql("""
				select stations from price_stats_daily where day = :day and fuel = 'GASOLEO_A' and area = '15'
				""").param("day", olderDay).query(Integer.class).single()).isEqualTo(1);
	}

	@Test
	void catchUpImportsOnlyTheDaysOfTheWindowThatAreNotCompleted() {
		given(this.ministry.fetchStations(any())).willReturn(sampleStations("BP ALELLA", "1,949"));
		importDay("2026-10-25");
		importDay("2026-10-27");

		List<LocalDate> imported = this.scheduler.catchUp(TODAY);

		assertThat(imported).containsExactly(LocalDate.of(2026, 10, 26), LocalDate.of(2026, 10, 24));
		assertThat(this.jdbc.sql("select count(*) from import_day where status = 'COMPLETED'")
			.query(Integer.class)
			.single()).isEqualTo(4);
	}

	@Test
	void catchUpLeavesADayWhoseLockStaysBusyMissingButNotFailed() throws Exception {
		try (Connection connection = this.dataSource.getConnection()) {
			holdImportLock(connection);
			try {
				this.scheduler.catchUp(TODAY);
			}
			finally {
				releaseImportLock(connection);
			}
		}

		assertThat(this.jdbc.sql("select count(*) from import_day").query(Integer.class).single()).isZero();
		assertThat(this.scheduler.missingDays(TODAY)).hasSize(4);
	}

	@Test
	void dataAgeIsNotANumberUntilADayIsPublished() {
		assertThat(gauge("fuel_insights.data.age")).isNaN();
	}

	@Test
	void dataAgeCountsTheDaysFromTheLatestPublishedDayToToday() {
		given(this.ministry.fetchStations(any())).willReturn(sampleStations("BP ALELLA", "1,949"));
		importDay("2026-10-20");
		importDay("2026-10-26");

		assertThat(gauge("fuel_insights.data.age")).isEqualTo(2);
	}

	@Test
	void dayBeingReimportedStillCountsForTheDataAge() {
		given(this.ministry.fetchStations(DAY)).willReturn(sampleStations("BP ALELLA", "1,949"));
		importDay("2026-10-27");

		this.importDays.markRunning(DAY, 999L);

		assertThat(gauge("fuel_insights.data.age")).isEqualTo(1);
	}

	@Test
	void missingDaysCountsTheDaysOfTheWindowThatAreNotCompleted() {
		given(this.ministry.fetchStations(any())).willReturn(sampleStations("BP ALELLA", "1,949"));
		importDay("2026-10-25");
		importDay("2026-10-27");

		assertThat(gauge("fuel_insights.data.missing_days")).isEqualTo(2);
	}

	private double gauge(String name) {
		return this.meters.get(name).gauge().value();
	}

	// Nested test configurations are picked up automatically, in addition to the application's.
	@TestConfiguration(proxyBeanMethods = false)
	static class Today {

		@Bean
		@Primary
		Clock fixedClock() {
			return Clock.fixed(Instant.parse("2026-10-28T10:00:00Z"), ZoneId.of("Europe/Madrid"));
		}

	}

	private MvcTestResult importDay(String date) {
		return this.mvc.post().uri("/api/imports?date=" + date).exchange();
	}

	private String statusOf(LocalDate day) {
		return this.jdbc.sql("select status from import_day where day = :day").param("day", day)
			.query(String.class)
			.single();
	}

	private String brandOf(int stationId) {
		return this.jdbc.sql("select brand from station where id = :id").param("id", stationId)
			.query(String.class)
			.single();
	}

	private double nationalAverage() {
		return this.jdbc.sql("""
				select average_price from price_stats_daily where day = :day and fuel = 'GASOLEO_A' and area = 'ES'
				""").param("day", DAY).query(Double.class).single();
	}

	// Same stations as src/test/resources/ministry/day-sample.json; the Gasóleo A price of 8329 can change.
	private static List<MinistryStation> sampleStations(String brandOf8329, String gasoleoAOf8329) {
		return List.of(station("8329", brandOf8329, "08", "BARCELONA", gasoleoAOf8329, "1,849", "2,039", "1,989"),
				station("1736", "NIEVES", "08", "BARCELONA", "1,879", "1,769", "1,899", ""),
				station("15321", "CLUN", "15", "CORUÑA (A)", "1,959", "1,819", "", ""));
	}

	private static List<MinistryStation> withoutGasolina95Of15321(List<MinistryStation> stations) {
		return List.of(stations.get(0), stations.get(1),
				station("15321", "CLUN", "15", "CORUÑA (A)", "1,959", "", "", ""));
	}

	private static MinistryStation station(String id, String brand, String provinceId, String province,
			String gasoleoA, String gasolina95, String gasoleoPremium, String gasolina98) {
		return new MinistryStation(id, brand, null, null, provinceId, province, null, null, null, null,
				MinistryFields.prices(gasoleoA, gasolina95, gasoleoPremium, gasolina98));
	}

	// The import lock is a session lock, as in ImportLock: it must be released before the connection goes back to the
	// pool, or a later import in another test could find it held.
	private static void holdImportLock(Connection connection) throws SQLException {
		lockCall(connection, "select pg_advisory_lock(?)");
	}

	private static void releaseImportLock(Connection connection) throws SQLException {
		lockCall(connection, "select pg_advisory_unlock(?)");
	}

	private static void lockCall(Connection connection, String sql) throws SQLException {
		try (PreparedStatement statement = connection.prepareStatement(sql)) {
			statement.setLong(1, ImportLock.LOCK_KEY);
			statement.executeQuery().close();
		}
	}

}
