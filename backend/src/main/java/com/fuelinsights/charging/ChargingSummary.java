package com.fuelinsights.charging;

import java.util.List;

/**
 * What a list of charging sites shows: the operator, the site's name when it is readable, the town, and the opening
 * hours read as in {@link ChargingSiteResponse#openingHours()}.
 */
record ChargingSummary(String id, String name, String operator, String town, List<List<List<String>>> openingHours) {
}
