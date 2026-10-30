package com.fuelinsights.stats;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonFormat;

import com.fuelinsights.prices.FuelView;

/** Every station selling one fuel now, for the map: about 11,000 rows, so each one is a short array. */
public record StationsResponse(FuelView fuel, OffsetDateTime updatedAt, List<MapStation> stations) {

	/** Written as {@code [id, latitude, longitude, price]}. */
	@JsonFormat(shape = JsonFormat.Shape.ARRAY)
	public record MapStation(int id, BigDecimal latitude, BigDecimal longitude, BigDecimal price) {
	}

}
