package com.fuelinsights.stats;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.fuelinsights.prices.FuelView;

/** Prices of one fuel per province on one published day, plus the national figures. */
public record ProvinceStatsResponse(FuelView fuel, LocalDate date, Instant importedAt, PriceSummary national,
		List<ProvincePrice> provinces) {

	/** Figures for the whole country; the prices are null when no station sold the fuel that day. */
	public record PriceSummary(BigDecimal averagePrice, BigDecimal medianPrice, BigDecimal minPrice,
			BigDecimal maxPrice, int stations) {

		static PriceSummary empty() {
			return new PriceSummary(null, null, null, null, 0);
		}

	}

	public record ProvincePrice(String provinceId, String province, BigDecimal averagePrice, BigDecimal medianPrice,
			BigDecimal minPrice, BigDecimal maxPrice, int stations) {
	}

}
