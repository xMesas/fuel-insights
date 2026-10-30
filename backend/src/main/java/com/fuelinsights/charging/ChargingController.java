package com.fuelinsights.charging;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.function.Function;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.server.ResponseStatusException;

import com.fuelinsights.charging.ChargingSiteResponse.Connector;
import com.fuelinsights.shared.NoDataException;
import com.fuelinsights.shared.PlaceName;

/**
 * Read API for the charging sites: every site for the map, and one site for the card. The data changes once a day,
 * so answers carry the feed time as their ETag and may be reused for an hour.
 */
@RestController
@RequestMapping("/api/charging/sites")
class ChargingController {

	private static final CacheControl CACHE = CacheControl.maxAge(Duration.ofHours(1)).cachePublic();

	private static final ZoneId MADRID = ZoneId.of("Europe/Madrid");

	private static final int MAX_SUMMARIES = 50;

	private final ChargingRepository repository;

	ChargingController(ChargingRepository repository) {
		this.repository = repository;
	}

	@GetMapping
	ResponseEntity<ChargingSitesResponse> sites(WebRequest request) {
		return cached(request, "sites",
				(publishedAt) -> new ChargingSitesResponse(madrid(publishedAt), this.repository.mapSites()));
	}

	// The map's list of the most powerful sites nearby gets its names in one request: /summaries?ids=a,b,c
	@GetMapping("/summaries")
	List<ChargingSummary> summaries(@RequestParam List<String> ids) {
		if (ids.size() > MAX_SUMMARIES) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Ask for at most " + MAX_SUMMARIES + " sites at a time.");
		}
		if (ids.isEmpty()) {
			return List.of();
		}
		return this.repository.summaries(ids)
			.stream()
			.map((row) -> new ChargingSummary(row.id(), ChargingNames.siteName(row.name()),
					ChargingNames.operator(row.operator()), (row.town() != null) ? PlaceName.display(row.town()) : null,
					ChargingHours.parse(row.schedule()).orElse(null)))
			.toList();
	}

	@GetMapping("/{id}")
	ResponseEntity<ChargingSiteResponse> site(@PathVariable String id, WebRequest request) {
		return cached(request, "site-" + id, (publishedAt) -> this.repository.site(id)
			.map((site) -> card(site, publishedAt))
			.orElseThrow(() -> new NoDataException("The charging site " + id + " is not known.")));
	}

	private ChargingSiteResponse card(ChargingSite site, Instant publishedAt) {
		return new ChargingSiteResponse(site.id(), ChargingNames.siteName(site.name()),
				ChargingNames.operator(site.operator()), site.address(),
				(site.town() != null) ? PlaceName.display(site.town()) : null,
				(site.province() != null) ? PlaceName.display(site.province()) : null, site.postcode(), site.latitude(),
				site.longitude(), site.maxPowerKw(), site.points(),
				site.connectors()
					.stream()
					.map((connector) -> new Connector(ChargingNames.connector(connector.type()), connector.current(),
							connector.powerKw(), connector.count()))
					.toList(),
				ChargingNames.payment(site.payment()), site.schedule(),
				ChargingHours.parse(site.schedule()).orElse(null),
				(site.updatedAt() != null) ? madrid(site.updatedAt()) : null, madrid(publishedAt));
	}

	private <T> ResponseEntity<T> cached(WebRequest request, String resource, Function<Instant, T> body) {
		Instant publishedAt = this.repository.publishedAt()
			.orElseThrow(() -> new NoDataException("No charging sites have been imported yet."));
		String etag = "charging-" + publishedAt.getEpochSecond() + "-" + resource;
		if (request.checkNotModified(etag)) {
			return null;
		}
		return ResponseEntity.ok().eTag(etag).cacheControl(CACHE).body(body.apply(publishedAt));
	}

	private static OffsetDateTime madrid(Instant instant) {
		return instant.atZone(MADRID).toOffsetDateTime();
	}

}
