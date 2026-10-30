package com.fuelinsights.prices;

import java.math.BigDecimal;

/** The price of one fuel at one station now, in euros per litre. */
public record CurrentPrice(int stationId, Fuel fuel, BigDecimal price) {
}
