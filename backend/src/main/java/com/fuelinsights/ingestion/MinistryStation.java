package com.fuelinsights.ingestion;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import com.fuelinsights.prices.DailyPrice;
import com.fuelinsights.prices.Fuel;
import com.fuelinsights.stations.Station;

/**
 * One station exactly as the Ministry JSON sends it: Spanish names and numbers as text with a decimal comma. The
 * prices come as one field per product ({@code "Precio Gasoleo A": "1,829"}); every field not named here lands in
 * {@code fields}, and {@link #prices()} picks the ones {@link Fuel} knows.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
record MinistryStation(
		@JsonProperty("IDEESS") String id,
		@JsonProperty("Rótulo") String brand,
		@JsonProperty("Dirección") String address,
		@JsonProperty("Municipio") String municipality,
		@JsonProperty("IDProvincia") String provinceId,
		@JsonProperty("Provincia") String province,
		@JsonProperty("C.P.") String postalCode,
		@JsonProperty("Latitud") String latitude,
		@JsonProperty("Longitud (WGS84)") String longitude,
		@JsonProperty("Horario") String schedule,
		@JsonAnySetter Map<String, String> fields) {

	MinistryStation {
		fields = (fields != null) ? fields : Map.of();
	}

	Station toStation() {
		return new Station(Integer.parseInt(this.id.trim()), this.brand.trim(), trimToNull(this.address),
				trimToNull(this.municipality), this.provinceId.trim(), this.province.trim(), trimToNull(this.postalCode),
				parseDecimal(this.latitude), parseDecimal(this.longitude), null);
	}

	/** Only the fuels this station sells: an empty price means "not sold here". */
	List<DailyPrice> prices() {
		int stationId = Integer.parseInt(this.id.trim());
		String provinceOfTheDay = this.provinceId.trim();
		List<DailyPrice> prices = new ArrayList<>();
		for (Fuel fuel : Fuel.values()) {
			BigDecimal price = parseDecimal(this.fields.get(fuel.ministryField()));
			if (price != null && price.signum() > 0) {
				prices.add(new DailyPrice(stationId, provinceOfTheDay, fuel, price));
			}
		}
		return prices;
	}

	String trimmedSchedule() {
		return trimToNull(this.schedule);
	}

	static BigDecimal parseDecimal(String text) {
		if (text == null || text.isBlank()) {
			return null;
		}
		return new BigDecimal(text.trim().replace(',', '.'));
	}

	private static String trimToNull(String text) {
		return (text == null || text.isBlank()) ? null : text.trim();
	}

}
