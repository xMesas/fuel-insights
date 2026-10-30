package com.fuelinsights.stats;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import com.fuelinsights.prices.FuelView;

/** The national prices in force now for every fuel, with yesterday's average and the highest one of the history. */
public record CurrentStatsResponse(OffsetDateTime updatedAt, List<CurrentFuel> fuels) {

	/** The prices are null and the provinces empty when no station sells the fuel now. */
	public record CurrentFuel(FuelView fuel, BigDecimal averagePrice, BigDecimal medianPrice, BigDecimal minPrice,
			BigDecimal maxPrice, int stations, DailyAverage yesterday, DailyAverage maxDaily,
			List<ProvinceAverage> provinces) {
	}

	public record DailyAverage(LocalDate date, BigDecimal averagePrice) {
	}

	public record ProvinceAverage(String provinceId, BigDecimal averagePrice, int stations) {
	}

}
