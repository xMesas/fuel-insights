package com.fuelinsights.charging;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonFormat;

/** Every public charging site with a known power, for the map: about 12,000 rows, so each one is a short array. */
record ChargingSitesResponse(OffsetDateTime updatedAt, List<MapSite> sites) {

	/** Written as {@code [id, latitude, longitude, maxPowerKw, points]}. */
	@JsonFormat(shape = JsonFormat.Shape.ARRAY)
	record MapSite(String id, BigDecimal latitude, BigDecimal longitude, BigDecimal maxPowerKw, int points) {
	}

}
