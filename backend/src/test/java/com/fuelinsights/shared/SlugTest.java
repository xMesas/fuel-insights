package com.fuelinsights.shared;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SlugTest {

	@Test
	void accentsAndTheEnyeBecomePlainLetters() {
		assertThat(Slug.of("A Coruña")).isEqualTo("a-coruna");
		assertThat(Slug.of("Ávila")).isEqualTo("avila");
	}

	@Test
	void apostrophesAndPunctuationSeparateWords() {
		assertThat(Slug.of("L'Hospitalet de Llobregat")).isEqualTo("l-hospitalet-de-llobregat");
		assertThat(Slug.of("ES SAN ANTONIOABAD. FUENTEALBILLA")).isEqualTo("es-san-antonioabad-fuentealbilla");
	}

	@Test
	void catalanMiddleDotKeepsTheWordWhole() {
		assertThat(Slug.of("Castellbell i el Vilar · Paral·lel")).isEqualTo("castellbell-i-el-vilar-parallel");
	}

	@Test
	void longNamesAreCutAtAWordBoundary() {
		assertThat(Slug.of("PETROVOLTREGÀ - ÀREA DEL COLLSACABRA", 20)).isEqualTo("petrovoltrega-area");
		assertThat(Slug.of("REPSOL", 20)).isEqualTo("repsol");
	}

}
