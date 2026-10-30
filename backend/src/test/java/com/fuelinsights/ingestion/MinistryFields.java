package com.fuelinsights.ingestion;

import java.util.HashMap;
import java.util.Map;

import com.fuelinsights.prices.Fuel;

/** The price fields of a Ministry station for tests, keyed as the Ministry JSON writes them. */
final class MinistryFields {

	private MinistryFields() {
	}

	static Map<String, String> prices(String gasoleoA, String gasolina95, String gasoleoPremium, String gasolina98) {
		Map<String, String> fields = new HashMap<>();
		put(fields, Fuel.GASOLEO_A, gasoleoA);
		put(fields, Fuel.GASOLINA_95_E5, gasolina95);
		put(fields, Fuel.GASOLEO_PREMIUM, gasoleoPremium);
		put(fields, Fuel.GASOLINA_98_E5, gasolina98);
		return fields;
	}

	private static void put(Map<String, String> fields, Fuel fuel, String price) {
		if (price != null) {
			fields.put(fuel.ministryField(), price);
		}
	}

}
