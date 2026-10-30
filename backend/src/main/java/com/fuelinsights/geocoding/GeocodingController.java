package com.fuelinsights.geocoding;

import java.time.Duration;
import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fuelinsights.geocoding.GeocodingService.GeoPlace;
import com.fuelinsights.shared.NoDataException;

/** Addresses for the search box: {@code /api/geocode?q=calle portugal 55 mollet}. */
@RestController
@RequestMapping("/api/geocode")
@Validated
class GeocodingController {

	// Streets do not move: a browser or a proxy may keep an answer for a day.
	private static final CacheControl DAY = CacheControl.maxAge(Duration.ofDays(1)).cachePublic();

	private final GeocodingService geocoding;

	GeocodingController(GeocodingService geocoding) {
		this.geocoding = geocoding;
	}

	@GetMapping
	ResponseEntity<List<GeoPlace>> search(@RequestParam @NotBlank @Size(min = 3, max = 100) String q) {
		return ResponseEntity.ok().cacheControl(DAY).body(this.geocoding.search(q));
	}

	@GetMapping("/point")
	ResponseEntity<GeoPlace> point(@RequestParam @Size(max = 100) String id, @RequestParam @Size(max = 20) String type) {
		return this.geocoding.point(id, type)
			.map((place) -> ResponseEntity.ok().cacheControl(DAY).body(place))
			.orElseThrow(() -> new NoDataException("CartoCiudad cannot place " + type + " " + id + "."));
	}

}
