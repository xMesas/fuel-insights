package com.fuelinsights.ingestion;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.fuelinsights.prices.DailyPrice;
import com.fuelinsights.prices.Fuel;
import com.fuelinsights.stations.Station;

import static org.assertj.core.api.Assertions.assertThat;

class MinistryStationTest {

	@Test
	void decimalCommaIsReadAsADecimalPoint() {
		assertThat(MinistryStation.parseDecimal("1,829")).isEqualByComparingTo("1.829");
	}

	@Test
	void blankNumberIsNoNumber() {
		assertThat(MinistryStation.parseDecimal("")).isNull();
		assertThat(MinistryStation.parseDecimal(null)).isNull();
	}

	@Test
	void emptyPriceMeansTheFuelIsNotSold() {
		MinistryStation station = station("1,879", "1,769", "1,899", "");

		assertThat(station.prices()).extracting(DailyPrice::fuel)
			.containsExactly(Fuel.GASOLEO_A, Fuel.GASOLINA_95_E5, Fuel.GASOLEO_PREMIUM);
	}

	@Test
	void everyFuelTheMinistryListsIsRead() {
		Map<String, String> fields = new HashMap<>(MinistryFields.prices("1,879", "", "", ""));
		fields.put("Precio Gases licuados del petróleo", "1,119");
		fields.put("Precio Gas Natural Comprimido", "1,958");
		fields.put("Precio Hidrogeno", "25,000");
		fields.put("Margen", "D");
		MinistryStation station = new MinistryStation("15321", "CLUN", null, null, "15", "CORUÑA (A)", null, null, null,
				null, fields);

		assertThat(station.prices()).extracting(DailyPrice::fuel)
			.containsExactly(Fuel.GASOLEO_A, Fuel.GLP, Fuel.GNC, Fuel.HIDROGENO);
	}

	@Test
	void zeroPriceIsIgnored() {
		MinistryStation station = station("0,000", "", "", "");

		assertThat(station.prices()).isEmpty();
	}

	@Test
	void stationKeepsSignedCoordinatesAndTrimsText() {
		Station station = station("1,959", "", "", "").toStation();

		assertThat(station.id()).isEqualTo(15321);
		assertThat(station.brandRaw()).isEqualTo("CLUN");
		assertThat(station.longitude()).isEqualByComparingTo(new BigDecimal("-8.7025"));
		assertThat(station.provinceId()).isEqualTo("15");
	}

	private static MinistryStation station(String gasoleoA, String gasolina95, String gasoleoPremium,
			String gasolina98) {
		return new MinistryStation(" 15321", "CLUN ", "LUGAR MILLADOIRO", "Ames", "15", "CORUÑA (A)", "15864",
				"42,895278", "-8,702500", null, MinistryFields.prices(gasoleoA, gasolina95, gasoleoPremium, gasolina98));
	}

}
