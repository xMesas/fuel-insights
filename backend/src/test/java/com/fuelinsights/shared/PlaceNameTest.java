package com.fuelinsights.shared;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class PlaceNameTest {

	@ParameterizedTest
	@CsvSource(delimiter = '|', quoteCharacter = '"', textBlock = """
			Rozas de Madrid (Las) | Las Rozas de Madrid
			Bonillo (El)          | El Bonillo
			Nucia (la)            | La Nucia
			Alfàs del Pi (l')     | L'Alfàs del Pi
			Mercadal (Es)         | Es Mercadal
			Coruña (A)            | A Coruña
			""")
	void trailingArticleMovesToTheFront(String ministryName, String expected) {
		assertThat(PlaceName.display(ministryName)).isEqualTo(expected);
	}

	@ParameterizedTest
	@CsvSource(delimiter = '|', quoteCharacter = '"', textBlock = """
			Hospitalet de Llobregat, L' | L'Hospitalet de Llobregat
			Palmas de Gran Canaria, Las | Las Palmas de Gran Canaria
			Pobla de Vallbona, la       | La Pobla de Vallbona
			Balears, Illes              | Illes Balears
			""")
	void articleAfterACommaMovesToTheFront(String registerName, String expected) {
		assertThat(PlaceName.display(registerName)).isEqualTo(expected);
	}

	@ParameterizedTest
	@CsvSource(delimiter = '|', quoteCharacter = '"', textBlock = """
			Alicante/Alacant  | Alicante/Alacant
			Alcalá de Henares | Alcalá de Henares
			Palma             | Palma
			""")
	void nameWithoutArticleStaysAsItIs(String ministryName, String expected) {
		assertThat(PlaceName.display(ministryName)).isEqualTo(expected);
	}

}
