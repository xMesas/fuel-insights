package com.fuelinsights.charging;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class ChargingNamesTest {

	@ParameterizedTest
	@CsvSource(delimiter = '|', textBlock = """
			IBERDROLA CLIENTES S.A.U                    | Iberdrola
			ENDESA X WAY, S.L.                          | Endesa X Way
			REPSOL SOLUCIONES ENERGÉTICAS SA            | Repsol
			TotalEnergies Charging Services España, SLU | TotalEnergies
			(ZUNDER) Grupo Easychargar SA               | Zunder
			""")
	void bigOperatorsGetTheirBrand(String legalName, String brand) {
		assertThat(ChargingNames.operator(legalName)).isEqualTo(brand);
	}

	@ParameterizedTest
	@CsvSource(delimiter = '|', textBlock = """
			Motor Box Mallorca SL           | Motor Box Mallorca
			CHARGING TOGETHER SL            | Charging Together
			BARCELONA DE SERVEIS MUNICIPALS, SA | Barcelona de Serveis Municipals
			Punto Recargas SL               | Punto Recargas
			""")
	void otherOperatorsLoseTheirLegalForm(String legalName, String shown) {
		assertThat(ChargingNames.operator(legalName)).isEqualTo(shown);
	}

	@Test
	void codeIsNotShownAsAName() {
		assertThat(ChargingNames.siteName("E-28-BoadillaDelMonte-004")).isNull();
		assertThat(ChargingNames.siteName("22XP22T3KK4AK00030")).isNull();
		assertThat(ChargingNames.siteName("Burger King - Arrecife")).isEqualTo("Burger King - Arrecife");
	}

	@Test
	void connectorsAreNamedAsDriversKnowThem() {
		assertThat(ChargingNames.connector("iec62196T2COMBO")).isEqualTo("CCS2");
		assertThat(ChargingNames.connector("domesticF")).isEqualTo("Schuko");
	}

	@Test
	void paymentMethodsAreNamedOnce() {
		assertThat(ChargingNames.payment(List.of("apps", "creditCard", "debitCard", "unknown")))
			.containsExactly("App", "Tarjeta bancaria");
	}

}
