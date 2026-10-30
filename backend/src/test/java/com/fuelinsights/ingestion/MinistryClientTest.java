package com.fuelinsights.ingestion;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.restclient.test.autoconfigure.RestClientTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.resilience.annotation.EnableResilientMethods;
import org.springframework.test.web.client.MockRestServiceServer;

import com.fuelinsights.prices.DailyPrice;
import com.fuelinsights.prices.Fuel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.http.HttpMethod.GET;

// A slice test only builds the client: the properties and the retry support are switched on here.
@RestClientTest(value = MinistryClient.class, properties = { "fuel-insights.ministry.base-url=https://ministry.test",
		"fuel-insights.ministry.retry-delay=10ms" })
@EnableConfigurationProperties(MinistryProperties.class)
@EnableResilientMethods
class MinistryClientTest {

	private static final String DAY_URL = "https://ministry.test/EstacionesTerrestresHist/27-10-2026";

	private static final String CURRENT_URL = "https://ministry.test/EstacionesTerrestres/";

	private static final LocalDate DAY = LocalDate.of(2026, 10, 27);

	@Autowired
	private MinistryClient client;

	@Autowired
	private MockRestServiceServer server;

	@Test
	void dayIsRequestedWithTheMinistryDateFormatAndTranslated() {
		this.server.expect(requestTo(DAY_URL))
			.andExpect(method(GET))
			.andRespond(withSuccess(new ClassPathResource("ministry/day-sample.json"), MediaType.APPLICATION_JSON));

		List<MinistryStation> stations = this.client.fetchStations(DAY);

		assertThat(stations).hasSize(3);
		List<DailyPrice> prices = stations.stream().flatMap((station) -> station.prices().stream()).toList();
		assertThat(prices).hasSize(11);
		assertThat(prices).filteredOn((price) -> price.stationId() == 8329 && price.fuel() == Fuel.GASOLEO_A)
			.extracting(DailyPrice::price)
			.singleElement()
			.satisfies((price) -> assertThat(price).isEqualByComparingTo("1.949"));
	}

	@Test
	void serverErrorIsRetried() {
		this.server.expect(requestTo(DAY_URL)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
		this.server.expect(requestTo(DAY_URL))
			.andRespond(withSuccess(new ClassPathResource("ministry/day-sample.json"), MediaType.APPLICATION_JSON));

		assertThat(this.client.fetchStations(DAY)).hasSize(3);
		this.server.verify();
	}

	@Test
	void clientErrorIsNotRetried() {
		this.server.expect(requestTo(DAY_URL)).andRespond(withStatus(HttpStatus.NOT_FOUND));

		assertThatExceptionOfType(MinistryException.class).isThrownBy(() -> this.client.fetchStations(DAY));
		this.server.verify();
	}

	@Test
	void answerWithoutStationsIsAnError() {
		this.server.expect(requestTo(DAY_URL))
			.andRespond(withSuccess("{\"ResultadoConsulta\":\"OK\",\"ListaEESSPrecio\":[]}", MediaType.APPLICATION_JSON));

		assertThatExceptionOfType(MinistryException.class).isThrownBy(() -> this.client.fetchStations(DAY))
			.satisfies((ex) -> assertThat(ex.getStatusCode().value()).isEqualTo(502));
	}

	@Test
	void currentListKeepsTheMinistryMadridTimeAndTheOpeningHours() {
		this.server.expect(requestTo(CURRENT_URL))
			.andExpect(method(GET))
			.andRespond(withSuccess(new ClassPathResource("ministry/day-sample.json"), MediaType.APPLICATION_JSON));

		MinistryCurrentResponse current = this.client.fetchCurrent();

		// "27/10/2026 0:00:00" in Madrid, which is UTC+1 after the October clock change.
		assertThat(current.publishedAt()).isEqualTo(Instant.parse("2026-10-26T23:00:00Z"));
		assertThat(current.stations()).hasSize(3).first().satisfies((station) -> {
			assertThat(station.trimmedSchedule()).isEqualTo("L-D: 24H");
		});
	}

	@Test
	void currentListWithoutStationsIsAnError() {
		this.server.expect(requestTo(CURRENT_URL))
			.andRespond(withSuccess("{\"Fecha\":\"29/10/2026 13:45:09\",\"ResultadoConsulta\":\"OK\",\"ListaEESSPrecio\":[]}",
					MediaType.APPLICATION_JSON));

		assertThatExceptionOfType(MinistryException.class).isThrownBy(() -> this.client.fetchCurrent())
			.satisfies((ex) -> assertThat(ex.getStatusCode().value()).isEqualTo(502));
	}

}
