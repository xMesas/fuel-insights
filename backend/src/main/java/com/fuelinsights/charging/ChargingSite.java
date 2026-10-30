package com.fuelinsights.charging;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;

/**
 * One public charging site as the feed describes it, with the source's own codes ({@code iec62196T2COMBO},
 * {@code apps}): the read API turns them into words.
 *
 * @param points the charging points; one point may have several connectors, used one at a time
 * @param connectors the connectors grouped by type, current and power
 */
record ChargingSite(String id, String name, String operator, String address, String town, String province,
		String postcode, BigDecimal latitude, BigDecimal longitude, String schedule, List<String> payment, int points,
		List<ChargingConnector> connectors, Instant updatedAt) {

	/** The most powerful connector, or null when no connector gives a power that can be right. */
	BigDecimal maxPowerKw() {
		return this.connectors.stream()
			.map(ChargingConnector::powerKw)
			.max(Comparator.naturalOrder())
			.orElse(null);
	}

	/** {@code count} connectors of one type, current ({@code AC} or {@code DC}) and power. */
	record ChargingConnector(String type, String current, BigDecimal powerKw, int count) {
	}

}
