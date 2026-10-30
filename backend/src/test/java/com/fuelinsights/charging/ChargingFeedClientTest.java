package com.fuelinsights.charging;

import java.io.ByteArrayOutputStream;
import java.util.zip.GZIPOutputStream;

import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.restclient.test.autoconfigure.RestClientTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.resilience.annotation.EnableResilientMethods;
import org.springframework.test.web.client.MockRestServiceServer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

// A slice test only builds the client: the properties and the retry support are switched on here.
@RestClientTest(value = ChargingFeedClient.class, properties = { "fuel-insights.charging.feed-url=https://nap.test/feed.xml",
		"fuel-insights.ministry.retry-delay=10ms" })
@EnableConfigurationProperties(ChargingProperties.class)
@EnableResilientMethods
class ChargingFeedClientTest {

	private static final String FEED_URL = "https://nap.test/feed.xml";

	@Autowired
	private ChargingFeedClient client;

	@Autowired
	private MockRestServiceServer server;

	@Test
	void feedIsAskedForGzipAndUnpackedWhileItIsRead() throws Exception {
		HttpHeaders gzip = new HttpHeaders();
		gzip.set(HttpHeaders.CONTENT_ENCODING, "gzip");
		this.server.expect(requestTo(FEED_URL))
			.andExpect(header(HttpHeaders.ACCEPT_ENCODING, "gzip"))
			.andRespond(withSuccess(gzipped(sample()), MediaType.TEXT_XML).headers(gzip));

		assertThat(this.client.fetch().sites()).hasSize(3);
	}

	@Test
	void plainFeedIsReadToo() throws Exception {
		this.server.expect(requestTo(FEED_URL)).andRespond(withSuccess(sample(), MediaType.TEXT_XML));

		assertThat(this.client.fetch().sites()).hasSize(3);
	}

	@Test
	void serverErrorIsRetried() throws Exception {
		this.server.expect(requestTo(FEED_URL)).andRespond(withStatus(HttpStatus.BAD_GATEWAY));
		this.server.expect(requestTo(FEED_URL)).andRespond(withSuccess(sample(), MediaType.TEXT_XML));

		assertThat(this.client.fetch().sites()).hasSize(3);
		this.server.verify();
	}

	@Test
	void clientErrorIsNotRetried() {
		this.server.expect(requestTo(FEED_URL)).andRespond(withStatus(HttpStatus.NOT_FOUND));

		assertThatExceptionOfType(ChargingFeedException.class).isThrownBy(() -> this.client.fetch());
		this.server.verify();
	}

	@Test
	void unreadableFeedIsAnError() {
		this.server.expect(requestTo(FEED_URL)).andRespond(withSuccess("<html>Bad gateway</html>", MediaType.TEXT_HTML));

		assertThatExceptionOfType(ChargingFeedException.class).isThrownBy(() -> this.client.fetch());
	}

	@Test
	void feedWithoutSitesIsAnError() {
		String empty = """
				<payload><publicationTime>2026-10-30T10:00:00+01:00</publicationTime></payload>
				""";
		this.server.expect(requestTo(FEED_URL)).andRespond(withSuccess(empty, MediaType.TEXT_XML));

		assertThatExceptionOfType(ChargingFeedException.class).isThrownBy(() -> this.client.fetch())
			.withMessageContaining("no charging sites");
	}

	private static byte[] sample() throws Exception {
		return new ClassPathResource("charging/feed-sample.xml").getContentAsByteArray();
	}

	private static byte[] gzipped(byte[] bytes) throws Exception {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		try (GZIPOutputStream gzip = new GZIPOutputStream(out)) {
			gzip.write(bytes);
		}
		return out.toByteArray();
	}

}
