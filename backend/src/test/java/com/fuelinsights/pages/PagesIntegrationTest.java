package com.fuelinsights.pages;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import com.fuelinsights.TestcontainersConfiguration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The search engine pages over a small Spain written directly: two provinces, a town the register spells two ways, a
 * station far from the rest and one that sells nothing now.
 */
@SpringBootTest(properties = { "fuel-insights.import.cron=-", "fuel-insights.site.origin=https://example.es" })
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class PagesIntegrationTest {

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JdbcClient jdbc;

	@BeforeEach
	void smallSpain() {
		this.jdbc.sql("""
				truncate price_current, station_current, current_snapshot, import_day, price_stats_daily, price_daily,
					station, province cascade
				""").update();
		this.jdbc.sql("insert into province (id, name) values ('08', 'BARCELONA'), ('15', 'CORUÑA (A)')").update();
		station(1, "REPSOL", "Hospitalet de Llobregat, L'", "08", "41.3600", "2.1000");
		station(2, "BP", "L'Hospitalet de Llobregat", "08", "41.3610", "2.1010");
		station(3, "PLENOIL", "Sabadell", "08", "41.5400", "2.1100");
		station(4, "GALP", "Coruña, A", "15", "43.3600", "-8.4100");
		station(5, "CERRADA", "Sabadell", "08", "41.5410", "2.1110");
		price(1, "GASOLEO_A", "1.859");
		price(1, "GASOLINA_95_E5", "1.759");
		price(2, "GASOLEO_A", "1.839");
		price(3, "GASOLEO_A", "1.799");
		price(4, "GASOLEO_A", "1.899");
		this.jdbc.sql("""
				insert into current_snapshot (published_at, imported_at, stations, prices)
				values ('2026-10-29T13:45:09+01:00', now(), 4, 5)
				""").update();
		day("2026-10-27", "08", "1.901");
		day("2026-10-28", "08", "1.871");
		day("2026-10-27", "ES", "1.911");
		day("2026-10-28", "ES", "1.881");
	}

	@Test
	void fuelPageRanksProvincesCheapestFirstWithTheNationalCheapestStations() {
		MvcTestResult page = this.mvc.get().uri("/api/pages/fuels/GASOLEO_A").exchange();

		assertThat(page).hasStatusOk().bodyJson().isLenientlyEqualTo("""
				{"updatedAt": "2026-10-29T13:45:09+01:00",
				 "national": {"averagePrice": 1.849, "minPrice": 1.799, "maxPrice": 1.899, "stations": 4},
				 "provinces": [{"name": "Barcelona", "slug": "barcelona", "averagePrice": 1.832, "stations": 3},
					{"name": "A Coruña", "slug": "a-coruna", "averagePrice": 1.899, "stations": 1}]}
				""");
		assertThat(page).bodyJson().extractingPath("$.cheapest[*].slug").asArray()
			.containsExactly("3-plenoil-sabadell", "2-bp-l-hospitalet-de-llobregat",
					"1-repsol-l-hospitalet-de-llobregat", "4-galp-a-coruna");
	}

	@Test
	void provincePageComparesNowWithItsLatestAndHighestPublishedDays() {
		assertThat(this.mvc.get().uri("/api/pages/provinces/barcelona")).hasStatusOk().bodyJson()
			.extractingPath("$.fuels[0]")
			.isEqualTo(Map.of("fuel", Map.of("code", "GASOLEO_A", "name", "Gasóleo A", "shortName", "Diésel", "unit", "l",
					"main", true),
					"figures",
					Map.of("averagePrice", 1.832, "minPrice", 1.799, "maxPrice", 1.859, "stations", 3, "latestDay",
							Map.of("date", "2026-10-28", "averagePrice", 1.871), "highestDay",
							Map.of("date", "2026-10-27", "averagePrice", 1.901)),
					"nationalAverage", 1.849, "cheapest",
					List.of(row(3, "3-plenoil-sabadell", "PLENOIL", "Sabadell", "sabadell", 1.799),
							row(2, "2-bp-l-hospitalet-de-llobregat", "BP", "L'Hospitalet de Llobregat",
									"l-hospitalet-de-llobregat", 1.839),
							row(1, "1-repsol-l-hospitalet-de-llobregat", "REPSOL", "L'Hospitalet de Llobregat",
									"l-hospitalet-de-llobregat", 1.859))));
	}

	@Test
	void townsTheRegisterSpellsTwoWaysShareOnePage() {
		assertThat(this.mvc.get().uri("/api/pages/provinces/barcelona")).bodyJson()
			.extractingPath("$.towns")
			.isEqualTo(List.of(
					Map.of("name", "L'Hospitalet de Llobregat", "slug", "l-hospitalet-de-llobregat", "stations", 2),
					Map.of("name", "Sabadell", "slug", "sabadell", "stations", 1)));
	}

	@Test
	void townPageListsEveryStationSellingWithAllItsPrices() {
		MvcTestResult page = this.mvc.get().uri("/api/pages/provinces/barcelona/l-hospitalet-de-llobregat").exchange();

		assertThat(page).hasStatusOk().bodyJson().isLenientlyEqualTo("""
				{"province": {"name": "Barcelona", "slug": "barcelona"},
				 "town": {"name": "L'Hospitalet de Llobregat", "slug": "l-hospitalet-de-llobregat"},
				 "fuels": [{"fuel": {"code": "GASOLEO_A"}, "averagePrice": 1.849, "minPrice": 1.839, "stations": 2,
					"provinceAverage": 1.832},
					{"fuel": {"code": "GASOLINA_95_E5"}, "averagePrice": 1.759, "minPrice": 1.759, "stations": 1,
					"provinceAverage": 1.759}],
				 "stations": [{"id": 1, "prices": {"GASOLEO_A": 1.859, "GASOLINA_95_E5": 1.759}},
					{"id": 2, "prices": {"GASOLEO_A": 1.839}}]}
				""");
	}

	@Test
	void unknownProvinceOrTownHasNoPage() {
		assertThat(this.mvc.get().uri("/api/pages/provinces/narnia")).hasStatus(HttpStatus.NOT_FOUND);
		assertThat(this.mvc.get().uri("/api/pages/provinces/barcelona/narnia")).hasStatus(HttpStatus.NOT_FOUND);
		assertThat(this.mvc.get().uri("/api/pages/stations/999")).hasStatus(HttpStatus.NOT_FOUND);
	}

	@Test
	void stationPageLinksItsPlacesAndListsTheStationsWithinTenKilometresNearestFirst() {
		assertThat(this.mvc.get().uri("/api/pages/stations/1")).hasStatusOk().bodyJson().isLenientlyEqualTo("""
				{"slug": "1-repsol-l-hospitalet-de-llobregat",
				 "province": {"name": "Barcelona", "slug": "barcelona"},
				 "town": {"name": "L'Hospitalet de Llobregat", "slug": "l-hospitalet-de-llobregat"},
				 "nearby": [{"id": 2, "distanceKm": 0.1, "prices": {"GASOLEO_A": 1.839}}]}
				""");
		assertThat(this.mvc.get().uri("/api/pages/stations/1")).bodyJson()
			.extractingPath("$.nearby")
			.asArray()
			.hasSize(1);
	}

	@Test
	void sitemapListsEveryPageOnceWithTheDayOfThePrices() throws Exception {
		MvcTestResult sitemap = this.mvc.get().uri("/api/sitemap.xml").exchange();

		assertThat(sitemap).hasStatusOk().hasContentTypeCompatibleWith("application/xml");
		String xml = sitemap.getResponse().getContentAsString(StandardCharsets.UTF_8);
		assertThat(xml).contains("<url><loc>https://example.es/</loc><lastmod>2026-10-29</lastmod></url>")
			.contains("<loc>https://example.es/gasolineras/a-coruna/a-coruna</loc>")
			.contains("<loc>https://example.es/gasolinera/1-repsol-l-hospitalet-de-llobregat</loc>")
			.doesNotContain("cerrada");
		assertThat(xml.split("/gasolineras/barcelona/l-hospitalet-de-llobregat<", -1)).hasSize(2);
		// 4 fixed pages, 52 provinces, 3 towns and the 4 stations selling now.
		assertThat(xml.split("<url>", -1)).hasSize(1 + 4 + 52 + 3 + 4);
	}

	@Test
	void robotsMayCrawlEverythingAndFindTheSitemap() {
		assertThat(this.mvc.get().uri("/api/robots.txt")).hasStatusOk()
			.bodyText()
			.isEqualTo("User-agent: *\nAllow: /\n\nSitemap: https://example.es/sitemap.xml\n");
	}

	@Test
	void answerIsNotSentAgainWhileThePricesAreTheSame() {
		String etag = this.mvc.get().uri("/api/pages/provinces/barcelona").exchange().getResponse()
			.getHeader(HttpHeaders.ETAG);

		assertThat(this.mvc.get().uri("/api/pages/provinces/barcelona").header(HttpHeaders.IF_NONE_MATCH, etag))
			.hasStatus(HttpStatus.NOT_MODIFIED);
	}

	@Test
	void noPagesBeforeTheFirstPricesAreImported() {
		this.jdbc.sql("truncate current_snapshot").update();

		assertThat(this.mvc.get().uri("/api/pages/fuels/GASOLEO_A")).hasStatus(HttpStatus.NOT_FOUND);
		assertThat(this.mvc.get().uri("/api/sitemap.xml").accept("application/xml"))
			.hasStatus(HttpStatus.NOT_FOUND);
	}

	private void station(int id, String brand, String town, String province, String latitude, String longitude) {
		this.jdbc.sql("""
				insert into station (id, brand_raw, brand, municipality, province_id, latitude, longitude, first_seen,
					last_seen)
				values (:id, :brand, :brand, :town, :province, :latitude, :longitude, date '2026-01-01',
					date '2026-10-28')
				""")
			.param("id", id)
			.param("brand", brand)
			.param("town", town)
			.param("province", province)
			.param("latitude", new BigDecimal(latitude))
			.param("longitude", new BigDecimal(longitude))
			.update();
	}

	private void price(int station, String fuel, String price) {
		this.jdbc.sql("insert into price_current (station_id, fuel, price) values (:station, :fuel, :price)")
			.param("station", station)
			.param("fuel", fuel)
			.param("price", new BigDecimal(price))
			.update();
	}

	private void day(String day, String area, String average) {
		LocalDate date = LocalDate.parse(day);
		this.jdbc.sql("""
				insert into import_day (day, stations, prices, status, started_at, finished_at, published_at)
				values (:day, 4, 5, 'COMPLETED', now(), now(), now())
				on conflict (day) do nothing
				""").param("day", date).update();
		BigDecimal price = new BigDecimal(average);
		this.jdbc.sql("""
				insert into price_stats_daily (day, fuel, area, average_price, min_price, max_price, median_price,
					stations)
				values (:day, 'GASOLEO_A', :area, :price, :price, :price, :price, 3)
				""").param("day", date).param("area", area).param("price", price).update();
	}

	private static Map<String, Object> row(int id, String slug, String name, String town, String townSlug,
			double price) {
		return Map.of("id", id, "slug", slug, "name", name, "town", town, "townSlug", townSlug, "province",
				"Barcelona", "provinceSlug", "barcelona", "price", price);
	}

}
