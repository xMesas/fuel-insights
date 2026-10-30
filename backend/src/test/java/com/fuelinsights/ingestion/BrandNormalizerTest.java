package com.fuelinsights.ingestion;

import org.junit.jupiter.api.Test;

import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;

class BrandNormalizerTest {

	private final BrandNormalizer brands = new BrandNormalizer(new ClassPathResource("brands.csv"));

	@Test
	void signInTheMappingFileGetsItsBrand() {
		assertThat(this.brands.normalize("repsol butano ")).isEqualTo("REPSOL");
	}

	@Test
	void signWithACommaIsReadFromItsQuotedColumn() {
		assertThat(this.brands.normalize("LABOIL, S.L.")).isEqualTo("LABOIL");
	}

	@Test
	void knownBrandAsAWholeWordGivesThatBrand() {
		assertThat(this.brands.normalize("E.S. REPSOL ALCALA")).isEqualTo("REPSOL");
	}

	@Test
	void knownBrandInsideAnotherWordIsNotABrand() {
		assertThat(this.brands.normalize("GALPAGOS")).isEqualTo(BrandNormalizer.INDEPENDENT);
	}

	@Test
	void unknownSignIsIndependent() {
		assertThat(this.brands.normalize("GASOLINERA PEPE")).isEqualTo(BrandNormalizer.INDEPENDENT);
	}

}
