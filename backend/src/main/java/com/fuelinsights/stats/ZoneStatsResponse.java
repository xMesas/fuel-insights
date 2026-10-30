package com.fuelinsights.stats;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import com.fuelinsights.prices.FuelView;

/**
 * The price board for one zone: for every fuel sold there now, the cheapest price, the average and the number of
 * stations, plus the average of the same zone on {@code weekAgo} (null when that day is not complete).
 */
record ZoneStatsResponse(OffsetDateTime updatedAt, LocalDate weekAgo, List<ZoneFuel> fuels) {

	record ZoneFuel(FuelView fuel, BigDecimal minPrice, BigDecimal averagePrice, int stations,
			BigDecimal weekAgoAverage) {
	}

}
