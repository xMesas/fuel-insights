package com.fuelinsights.prices;

import java.time.Duration;
import java.util.function.Supplier;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.WebRequest;

/**
 * Answers that only change with the price data. Every user gets the same answer until the Ministry publishes a new
 * list or an imported day changes, so the ETag is the {@link DataVersion}, a browser or a proxy may reuse an answer
 * for five minutes, and after that a request with {@code If-None-Match} gets a 304 without running the queries.
 */
@Component
public class VersionedAnswers {

	private static final CacheControl SNAPSHOT_CACHE = CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic();

	private final DataVersion dataVersion;

	VersionedAnswers(DataVersion dataVersion) {
		this.dataVersion = dataVersion;
	}

	/**
	 * {@code resource} names the answer inside one version. Without data yet there is no version: the body (usually a
	 * 404 problem) is built as usual and nothing is cached.
	 */
	public <T> ResponseEntity<T> respond(WebRequest request, String resource, Supplier<T> body) {
		String version = this.dataVersion.current().orElse(null);
		if (version == null) {
			return ResponseEntity.ok(body.get());
		}
		String etag = version + "-" + resource;
		if (request.checkNotModified(etag)) {
			return null;
		}
		return ResponseEntity.ok().eTag(etag).cacheControl(SNAPSHOT_CACHE).body(body.get());
	}

}
