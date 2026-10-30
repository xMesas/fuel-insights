package com.fuelinsights.geocoding;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Optional;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * CartoCiudad, the National Geographic Institute's address search (CC BY 4.0): every street and street number in Spain,
 * towns and places. Called from the server, so it never sees the visitor's address or IP, only the text searched.
 */
@Component
class CartoCiudadClient {

	// A search box waits for this: better no address than a frozen box.
	private static final Duration TIMEOUT = Duration.ofSeconds(4);

	private final RestClient restClient;

	@Autowired
	CartoCiudadClient(RestClient.Builder builder, GeocodingProperties properties) {
		this(builder.baseUrl(properties.baseUrl().toString()).requestFactory(timeouts()).build());
	}

	// Tests pass a client bound to a mock server.
	CartoCiudadClient(RestClient restClient) {
		this.restClient = restClient;
	}

	private static JdkClientHttpRequestFactory timeouts() {
		JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
				HttpClient.newBuilder().connectTimeout(TIMEOUT).build());
		requestFactory.setReadTimeout(TIMEOUT);
		return requestFactory;
	}

	List<Candidate> candidates(String text, int limit) {
		try {
			List<Candidate> candidates = this.restClient.get()
				.uri((uri) -> uri.path("/candidates").queryParam("q", text).queryParam("limit", limit).build())
				.retrieve()
				.body(new ParameterizedTypeReference<>() {
				});
			return (candidates != null) ? candidates : List.of();
		}
		catch (RestClientException ex) {
			throw new GeocodingException(ex);
		}
	}

	/** The point of a candidate that came without one (towns, streets without a number). */
	Optional<Candidate> find(String id, String type) {
		try {
			return Optional.ofNullable(this.restClient.get()
				.uri((uri) -> uri.path("/find").queryParam("id", id).queryParam("type", type).build())
				.retrieve()
				.body(Candidate.class));
		}
		catch (RestClientException ex) {
			throw new GeocodingException(ex);
		}
	}

	/** The fields of a CartoCiudad answer the site uses; {@code lat} and {@code lng} are 0 when it gives no point. */
	@JsonIgnoreProperties(ignoreUnknown = true)
	record Candidate(String id, String type, String address, String muni, String province, String postalCode,
			double lat, double lng) {

		boolean hasPoint() {
			return this.lat != 0 || this.lng != 0;
		}

	}

}
