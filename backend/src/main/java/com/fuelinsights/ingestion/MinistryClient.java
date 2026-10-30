package com.fuelinsights.ingestion;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.resilience.annotation.Retryable;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** Reads one day of stations from the Ministry API, as the Ministry sends them. */
@Component
public class MinistryClient {

	private static final DateTimeFormatter PATH_DATE = DateTimeFormatter.ofPattern("dd-MM-yyyy");

	private final RestClient restClient;

	public MinistryClient(RestClient.Builder builder, MinistryProperties properties) {
		this.restClient = builder.baseUrl(properties.baseUrl().toString()).build();
	}

	// Network errors and 5xx are worth retrying; a 4xx or an empty answer will not change.
	@Retryable(includes = { ResourceAccessException.class, HttpServerErrorException.class }, maxRetries = 2,
			delayString = "${fuel-insights.ministry.retry-delay}")
	List<MinistryStation> fetchStations(LocalDate date) {
		MinistryDayResponse response;
		try {
			response = this.restClient.get()
				.uri("/EstacionesTerrestresHist/{date}", PATH_DATE.format(date))
				.accept(MediaType.APPLICATION_JSON)
				.retrieve()
				.body(MinistryDayResponse.class);
		}
		catch (RestClientException ex) {
			throw new MinistryException(date, ex.getMessage(), ex);
		}
		if (response == null || !response.isOk()) {
			throw new MinistryException(date, "no stations in the answer", null);
		}
		return response.stations();
	}

	@Retryable(includes = { ResourceAccessException.class, HttpServerErrorException.class }, maxRetries = 2,
			delayString = "${fuel-insights.ministry.retry-delay}")
	MinistryCurrentResponse fetchCurrent() {
		MinistryCurrentResponse response;
		try {
			response = this.restClient.get()
				.uri("/EstacionesTerrestres/")
				.accept(MediaType.APPLICATION_JSON)
				.retrieve()
				.body(MinistryCurrentResponse.class);
		}
		catch (RestClientException ex) {
			throw new MinistryException("the current prices", ex.getMessage(), ex);
		}
		if (response == null || !response.isOk()) {
			throw new MinistryException("the current prices", "no stations in the answer", null);
		}
		return response;
	}

}
