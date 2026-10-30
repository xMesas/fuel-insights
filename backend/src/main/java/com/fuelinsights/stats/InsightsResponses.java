package com.fuelinsights.stats;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import com.fuelinsights.prices.FuelView;

/** The answers of the statistics tab. Each one carries the dates of the data it was computed from. */
public final class InsightsResponses {

	private InsightsResponses() {
	}

	/**
	 * Monday ({@code 1}) to Sunday ({@code 7}): how many euros per litre each weekday's national average sits above
	 * (positive) or below (negative) the week around it, between {@code from} and {@code to}.
	 */
	public record WeekdayResponse(FuelView fuel, LocalDate from, LocalDate to, List<Weekday> weekdays) {

		public record Weekday(int weekday, BigDecimal deviation, int days) {
		}

	}

	/**
	 * What choosing well saves now: in Spain and in each province, the price of one of the cheap stations (10th
	 * percentile), the middle one and one of the dear ones (90th). Provinces with the widest spread first.
	 */
	public record SpreadResponse(OffsetDateTime updatedAt, FuelView fuel, Spread spain, List<Spread> provinces) {

		public record Spread(String provinceId, BigDecimal cheapPrice, BigDecimal medianPrice, BigDecimal dearPrice,
				BigDecimal minPrice, BigDecimal maxPrice, int stations) {
		}

	}

	/** The average now of each brand with enough stations to compare, cheapest first, and Spain's average. */
	public record BrandsResponse(OffsetDateTime updatedAt, FuelView fuel, BigDecimal nationalAverage,
			List<Brand> brands) {

		public record Brand(String code, String name, BigDecimal averagePrice, BigDecimal minPrice, int stations) {
		}

	}

}
