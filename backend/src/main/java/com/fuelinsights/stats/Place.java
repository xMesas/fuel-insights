package com.fuelinsights.stats;

import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * A town for the search box, placed at the average position of its stations. Written as
 * {@code [name, provinceId, latitude, longitude, stations]}: the browser loads all of them once.
 */
@JsonFormat(shape = JsonFormat.Shape.ARRAY)
public record Place(String name, String provinceId, BigDecimal latitude, BigDecimal longitude, int stations) {
}
