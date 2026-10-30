package com.fuelinsights.stats;

import java.util.List;

/**
 * What a list of stations shows: the sign text, the town, and the opening hours read as in
 * {@link StationResponse#openingHours()}, so the list can say which ones are closed now.
 */
public record StationSummary(int id, String name, String municipality, List<List<List<String>>> openingHours) {
}
