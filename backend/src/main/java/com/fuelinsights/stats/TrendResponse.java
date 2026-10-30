package com.fuelinsights.stats;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import com.fuelinsights.prices.FuelView;

/** One point per calendar day; a day without data has null prices, so the chart shows a gap. */
public record TrendResponse(FuelView fuel, AreaView area, LocalDate from, LocalDate to, List<TrendPoint> points) {

	public record TrendPoint(LocalDate date, BigDecimal averagePrice, BigDecimal medianPrice,
			BigDecimal movingAverage7, int stations) {
	}

}
