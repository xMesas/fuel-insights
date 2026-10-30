package com.fuelinsights.prices;

import java.math.BigDecimal;

/** The price of one fuel at one station on one day, in euros per litre, with the station's province that day. */
public record DailyPrice(int stationId, String provinceId, Fuel fuel, BigDecimal price) {
}
