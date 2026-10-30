package com.fuelinsights.stats;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.WebRequest;

import com.fuelinsights.prices.Fuel;
import com.fuelinsights.prices.VersionedAnswers;

/**
 * Read API for the prices in force now: the price board, the map and the station card.
 *
 * <p>
 * Every user gets the same answers until the Ministry publishes a new list (every half hour), so they are cacheable:
 * the ETag is the version of the data, a browser or a proxy may reuse an answer for five minutes, and after that a
 * request with {@code If-None-Match} gets a 304 without running the queries.
 */
@RestController
@RequestMapping("/api")
class CurrentController {

	private static final Duration PLACES_CACHE = Duration.ofHours(1);

	private final CurrentService currentService;

	private final VersionedAnswers answers;

	CurrentController(CurrentService currentService, VersionedAnswers answers) {
		this.currentService = currentService;
		this.answers = answers;
	}

	@GetMapping("/stats/current")
	ResponseEntity<CurrentStatsResponse> current(WebRequest request) {
		return this.answers.respond(request, "current", this.currentService::current);
	}

	// The price board follows what the driver looks at: the map's box, the search circle or one province.
	@GetMapping("/stats/zone")
	ResponseEntity<ZoneStatsResponse> zone(@RequestParam(required = false) BigDecimal west,
			@RequestParam(required = false) BigDecimal south, @RequestParam(required = false) BigDecimal east,
			@RequestParam(required = false) BigDecimal north, @RequestParam(required = false) BigDecimal latitude,
			@RequestParam(required = false) BigDecimal longitude, @RequestParam(required = false) Integer radius,
			@RequestParam(required = false) String province, WebRequest request) {
		Zone zone = Zone.of(west, south, east, north, latitude, longitude, radius, province);
		return this.answers.respond(request, "zone-" + zone.key(), () -> this.currentService.zone(zone));
	}

	@GetMapping("/stations")
	ResponseEntity<StationsResponse> stations(@RequestParam Fuel fuel, WebRequest request) {
		return this.answers.respond(request, "stations-" + fuel.name(), () -> this.currentService.stations(fuel));
	}

	@GetMapping("/stats/municipalities")
	ResponseEntity<List<MunicipalityPrice>> municipalities(@RequestParam Fuel fuel, WebRequest request) {
		return this.answers.respond(request, "municipalities-" + fuel.name(), () -> this.currentService.municipalities(fuel));
	}

	// The search box loads every town once; the list only changes when a station opens or closes.
	@GetMapping("/places")
	ResponseEntity<List<Place>> places() {
		return ResponseEntity.ok().cacheControl(CacheControl.maxAge(PLACES_CACHE)).body(this.currentService.places());
	}

	// The map's list of the cheapest stations nearby gets its names in one request: /stations/summaries?ids=1,2,3
	@GetMapping("/stations/summaries")
	List<StationSummary> summaries(@RequestParam List<Integer> ids) {
		return this.currentService.summaries(ids);
	}

	@GetMapping("/stations/{id}")
	ResponseEntity<StationResponse> station(@PathVariable int id, WebRequest request) {
		return this.answers.respond(request, "station-" + id, () -> this.currentService.station(id));
	}

}
