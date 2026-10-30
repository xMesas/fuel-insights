package com.fuelinsights.charging;

import java.io.InputStream;
import java.net.URI;
import java.util.zip.GZIPInputStream;

import javax.xml.stream.XMLStreamException;

import org.springframework.http.HttpHeaders;
import org.springframework.resilience.annotation.Retryable;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.fuelinsights.charging.ChargingFeedParser.ChargingFeed;

/**
 * Downloads the public charging sites that the Ministry for the Ecological Transition publishes through the DGT
 * National Access Point (DATEX II, CC BY 4.0, refreshed daily). Asked for gzip, the 85 MB of XML travel as a few
 * megabytes, and the parser reads them as they arrive.
 */
@Component
class ChargingFeedClient {

	private final RestClient restClient;

	private final URI feedUrl;

	ChargingFeedClient(RestClient.Builder builder, ChargingProperties properties) {
		this.restClient = builder.build();
		this.feedUrl = properties.feedUrl();
	}

	@Retryable(includes = { ResourceAccessException.class, HttpServerErrorException.class }, maxRetries = 2,
			delayString = "${fuel-insights.ministry.retry-delay}")
	ChargingFeed fetch() {
		ChargingFeed feed;
		try {
			feed = this.restClient.get()
				.uri(this.feedUrl)
				.header(HttpHeaders.ACCEPT_ENCODING, "gzip")
				.exchange((request, response) -> {
					if (response.getStatusCode().is5xxServerError()) {
						throw new HttpServerErrorException(response.getStatusCode(), "the charging feed failed");
					}
					if (!response.getStatusCode().is2xxSuccessful()) {
						throw new ChargingFeedException("the feed answered " + response.getStatusCode().value(), null);
					}
					boolean gzip = "gzip".equalsIgnoreCase(response.getHeaders().getFirst(HttpHeaders.CONTENT_ENCODING));
					try (InputStream body = gzip ? new GZIPInputStream(response.getBody()) : response.getBody()) {
						return ChargingFeedParser.parse(body);
					}
					catch (XMLStreamException ex) {
						throw new ChargingFeedException("the feed could not be read: " + ex.getMessage(), ex);
					}
				});
		}
		catch (RestClientException ex) {
			throw new ChargingFeedException(ex.getMessage(), ex);
		}
		// A degraded answer must never replace the catalog with nothing: the import keeps the sites it has.
		if (feed.sites().isEmpty()) {
			throw new ChargingFeedException("the feed lists no charging sites", null);
		}
		return feed;
	}

}
