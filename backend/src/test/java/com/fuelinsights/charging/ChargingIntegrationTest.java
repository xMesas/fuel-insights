package com.fuelinsights.charging;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;

import javax.sql.DataSource;

import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

import com.fuelinsights.TestcontainersConfiguration;
import com.fuelinsights.charging.ChargingFeedParser.ChargingFeed;
import com.fuelinsights.charging.ChargingImporter.Outcome;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

/** The charging sites against a real PostgreSQL: import, replacement and the read API. The feed is faked. */
@SpringBootTest(properties = "fuel-insights.import.cron=-")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ChargingIntegrationTest {

	private static final Instant PUBLISHED = Instant.parse("2026-10-29T09:16:20Z");

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private ChargingImporter importer;

	@Autowired
	private DataSource dataSource;

	@Autowired
	private MeterRegistry meters;

	@MockitoBean
	private ChargingFeedClient feed;

	@BeforeEach
	void emptyDatabase() {
		this.jdbc.sql("truncate charging_connector, charging_site, charging_snapshot").update();
	}

	@Test
	void mapGetsEverySiteWithAPowerAsShortArrays() throws Exception {
		importSample();

		assertThat(this.mvc.get().uri("/api/charging/sites")).hasStatusOk().bodyJson().isStrictlyEqualTo("""
				{
					"updatedAt": "2026-10-29T10:16:20+01:00",
					"sites": [
						["2023002088", 39.594800, 2.635860, 350.0, 1],
						["E-28-Getafe-004", 40.305710, -3.732950, 50.0, 2]
					]
				}
				""");
	}

	@Test
	void cardSpeaksTheDriversLanguage() throws Exception {
		importSample();

		assertThat(this.mvc.get().uri("/api/charging/sites/E-28-Getafe-004")).hasStatusOk()
			.bodyJson()
			.isLenientlyEqualTo("""
					{
						"id": "E-28-Getafe-004",
						"name": null,
						"operator": "Iberdrola",
						"address": "Calle Madrid 12",
						"town": "Getafe",
						"postalCode": "28901",
						"maxPowerKw": 50.0,
						"points": 2,
						"connectors": [
							{"type": "CCS2", "current": "DC", "powerKw": 50.0, "count": 2},
							{"type": "CHAdeMO", "current": "DC", "powerKw": 50.0, "count": 1},
							{"type": "Tipo 2", "current": "AC", "powerKw": 22.0, "count": 2}
						],
						"payment": ["App", "Tarjeta bancaria"],
						"schedule": null,
						"openingHours": null,
						"updatedAt": "2026-10-29T10:16:20+01:00"
					}
					""");
	}

	@Test
	void cardReadsTheHoursAndTheRegisterNames() throws Exception {
		importSample();

		var card = this.mvc.get().uri("/api/charging/sites/2023002088").exchange();
		assertThat(card).bodyJson().extractingPath("$.province").isEqualTo("Illes Balears");
		assertThat(card).bodyJson().extractingPath("$.postalCode").isEqualTo("07011");
		assertThat(card).bodyJson().extractingPath("$.operator").isEqualTo("Motor Box Mallorca");
		assertThat(card).bodyJson().extractingPath("$.openingHours[0]").isEqualTo(List.of(List.of("00:00", "24:00")));
		assertThat(card).bodyJson().extractingPath("$.openingHours[2]").isEqualTo(List.of(List.of("08:30", "17:30")));
	}

	@Test
	void siteWithoutAPowerIsOnlyLeftOffTheMap() throws Exception {
		importSample();

		assertThat(this.mvc.get().uri("/api/charging/sites/2024000777")).hasStatusOk()
			.bodyJson()
			.extractingPath("$.maxPowerKw")
			.isNull();
	}

	@Test
	void listGetsTheNamesOfAFewSitesInOneRequest() throws Exception {
		importSample();

		assertThat(this.mvc.get().uri("/api/charging/sites/summaries?ids=E-28-Getafe-004,2023002088,nope")).hasStatusOk()
			.bodyJson()
			.isLenientlyEqualTo("""
					[
						{"id": "2023002088", "name": "Centro Porsche Baleares CP2", "operator": "Motor Box Mallorca",
							"town": "Palma"},
						{"id": "E-28-Getafe-004", "name": null, "operator": "Iberdrola", "town": "Getafe",
							"openingHours": null}
					]
					""");
	}

	@Test
	void listAsksForAtMostFiftySites() throws Exception {
		importSample();
		String ids = String.join(",", java.util.Collections.nCopies(51, "x"));

		assertThat(this.mvc.get().uri("/api/charging/sites/summaries?ids=" + ids)).hasStatus(400);
	}

	@Test
	void feedAlreadyImportedIsNotWrittenAgain() throws Exception {
		importSample();
		Instant firstImport = importedAt();

		assertThat(this.importer.refresh()).isEqualTo(Outcome.UNCHANGED);

		assertThat(importedAt()).isEqualTo(firstImport);
	}

	@Test
	void newFeedReplacesEverySite() throws Exception {
		importSample();
		ChargingSite getafe = ChargingFeedParserTest.sampleSites().get(1);
		given(this.feed.fetch()).willReturn(new ChargingFeed(PUBLISHED.plusSeconds(86_400), List.of(getafe)));

		assertThat(this.importer.refresh()).isEqualTo(Outcome.UPDATED);

		assertThat(this.mvc.get().uri("/api/charging/sites/2023002088")).hasStatus(404);
		assertThat(this.jdbc.sql("select count(*) from charging_connector").query(Integer.class).single()).isEqualTo(3);
	}

	@Test
	void feedIsSkippedWhileAnotherInstanceImportsIt() throws Exception {
		given(this.feed.fetch()).willReturn(new ChargingFeed(PUBLISHED, ChargingFeedParserTest.sampleSites()));
		try (Connection other = this.dataSource.getConnection()) {
			other.setAutoCommit(false);
			try (PreparedStatement lock = other.prepareStatement("select pg_advisory_xact_lock(?)")) {
				lock.setLong(1, ChargingImporter.LOCK_KEY);
				lock.execute();

				assertThat(this.importer.refresh()).isEqualTo(Outcome.BUSY);
			}
			finally {
				other.rollback();
				other.setAutoCommit(true);
			}
		}
		assertThat(this.jdbc.sql("select count(*) from charging_site").query(Integer.class).single()).isZero();
	}

	@Test
	void freshnessMetricGivesTheAgeOfTheFeed() throws Exception {
		assertThat(this.meters.get("fuel_insights.charging.age").gauge().value()).isNaN();

		importSample();

		assertThat(this.meters.get("fuel_insights.charging.age").gauge().value()).isGreaterThanOrEqualTo(0);
	}

	@Test
	void unchangedSitesAnswer304() throws Exception {
		importSample();
		String etag = this.mvc.get().uri("/api/charging/sites").exchange().getResponse().getHeader("ETag");

		assertThat(this.mvc.get().uri("/api/charging/sites").header("If-None-Match", etag)).hasStatus(304);
	}

	@Test
	void nothingImportedYetIsNotFound() {
		assertThat(this.mvc.get().uri("/api/charging/sites")).hasStatus(404);
	}

	@Test
	void unknownSiteIsNotFound() throws Exception {
		importSample();

		assertThat(this.mvc.get().uri("/api/charging/sites/nope")).hasStatus(404);
	}

	private void importSample() throws Exception {
		given(this.feed.fetch()).willReturn(new ChargingFeed(PUBLISHED, ChargingFeedParserTest.sampleSites()));
		assertThat(this.importer.refresh()).isEqualTo(Outcome.UPDATED);
	}

	private Instant importedAt() {
		return this.jdbc.sql("select imported_at from charging_snapshot")
			.query(OffsetDateTime.class)
			.single()
			.toInstant();
	}

}
