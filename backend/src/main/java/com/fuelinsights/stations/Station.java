package com.fuelinsights.stations;

import java.math.BigDecimal;

/**
 * A petrol station as published by the Ministry. {@code brandRaw} is the sign text as written; {@code brand} is the
 * normalised brand, or null until the import normalises it.
 */
public record Station(int id, String brandRaw, String address, String municipality, String provinceId,
		String province, String postalCode, BigDecimal latitude, BigDecimal longitude, String brand) {

	public Station withBrand(String brand) {
		return new Station(this.id, this.brandRaw, this.address, this.municipality, this.provinceId, this.province,
				this.postalCode, this.latitude, this.longitude, brand);
	}

}
