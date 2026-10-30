package com.fuelinsights.stats;

import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * The current average of one fuel in one town, for the map by towns. Written as
 * {@code [name, provinceId, averagePrice, stations]}; the browser joins it to the town boundaries by province and
 * name.
 */
@JsonFormat(shape = JsonFormat.Shape.ARRAY)
public record MunicipalityPrice(String name, String provinceId, BigDecimal averagePrice, int stations) {
}
