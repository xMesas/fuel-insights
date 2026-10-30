package com.fuelinsights.charging;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * One charging site as the card shows it. {@code name} is null when the feed only gives an internal code;
 * {@code openingHours} is the {@code schedule} text read into seven days of ranges, or null when there is no text or
 * it cannot be read. The feed publishes no prices and no live availability.
 */
record ChargingSiteResponse(String id, String name, String operator, String address, String town, String province,
		String postalCode, BigDecimal latitude, BigDecimal longitude, BigDecimal maxPowerKw, int points,
		List<Connector> connectors, List<String> payment, String schedule, List<List<List<String>>> openingHours,
		OffsetDateTime siteUpdatedAt, OffsetDateTime updatedAt) {

	/** {@code count} connectors of one type, current ({@code AC} or {@code DC}) and power. */
	record Connector(String type, String current, BigDecimal powerKw, int count) {
	}

}
