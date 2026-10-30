package com.fuelinsights.stats;

import java.math.BigDecimal;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * The part of Spain the price board describes: what the map shows, the search circle, or one province. Each kind is
 * a fixed SQL condition on the station's position, with the values bound as parameters.
 */
record Zone(String condition, Map<String, Object> parameters, String key) {

	// The same formula and radius as the web's distanceKm, so the board and the list agree on what is inside.
	private static final String CIRCLE = """
			2 * 6371 * asin(sqrt(least(1, power(sin(radians(s.latitude - :latitude) / 2), 2)
				+ cos(radians(:latitude)) * cos(radians(s.latitude)) * power(sin(radians(s.longitude - :longitude) / 2), 2))))
				<= :radius""";

	private static final int MAX_RADIUS_KM = 100;

	static Zone of(BigDecimal west, BigDecimal south, BigDecimal east, BigDecimal north, BigDecimal latitude,
			BigDecimal longitude, Integer radius, String province) {
		boolean box = west != null || south != null || east != null || north != null;
		boolean circle = latitude != null || longitude != null || radius != null;
		boolean area = province != null;
		if ((box ? 1 : 0) + (circle ? 1 : 0) + (area ? 1 : 0) != 1) {
			throw badRequest("Give one zone: west, south, east and north; latitude, longitude and radius; or province.");
		}
		if (box) {
			if (west == null || south == null || east == null || north == null || south.compareTo(north) > 0
					|| west.compareTo(east) > 0) {
				throw badRequest("A box needs west <= east and south <= north.");
			}
			return new Zone("s.latitude between :south and :north and s.longitude between :west and :east",
					Map.of("west", west, "south", south, "east", east, "north", north),
					"box-" + west + "," + south + "," + east + "," + north);
		}
		if (circle) {
			if (latitude == null || longitude == null || radius == null || radius < 1 || radius > MAX_RADIUS_KM) {
				throw badRequest("A circle needs latitude, longitude and a radius from 1 to " + MAX_RADIUS_KM + " km.");
			}
			return new Zone(CIRCLE, Map.of("latitude", latitude, "longitude", longitude, "radius", radius),
					"circle-" + latitude + "," + longitude + "," + radius);
		}
		if (!province.matches("\\d{2}")) {
			throw badRequest("A province is its two-digit code.");
		}
		return new Zone("s.province_id = :province", Map.of("province", province), "province-" + province);
	}

	private static ResponseStatusException badRequest(String reason) {
		return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
	}

}
