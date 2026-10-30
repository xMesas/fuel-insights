package com.fuelinsights.stats;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import com.fuelinsights.prices.FuelView;

/**
 * One station: its details, the prices in force now and the last 30 published days of each fuel.
 * {@code openingHours} is the {@code schedule} text read into seven days of ranges (see {@link OpeningHours}), or
 * null when the text cannot be read with confidence.
 */
public record StationResponse(int id, String name, String address, String municipality, String provinceId,
		String province, String postalCode, BigDecimal latitude, BigDecimal longitude, String schedule,
		List<List<List<String>>> openingHours, OffsetDateTime updatedAt, List<StationPrice> prices,
		List<FuelHistory> history) {

	public record StationPrice(FuelView fuel, BigDecimal price) {
	}

	public record FuelHistory(String fuel, List<HistoryPoint> points) {
	}

	public record HistoryPoint(LocalDate date, BigDecimal price) {
	}

}
