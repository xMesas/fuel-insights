package com.fuelinsights.pages;

import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;

import com.fuelinsights.shared.Slug;

import static org.assertj.core.api.Assertions.assertThat;

class ProvinceTest {

	@Test
	void everyMinistryProvinceIdHasOnePage() {
		assertThat(Province.ALL).extracting(Province::id)
			.containsExactlyElementsOf(IntStream.rangeClosed(1, 52).mapToObj("%02d"::formatted).toList());
	}

	@Test
	void everySlugIsTheSlugOfTheName() {
		assertThat(Province.ALL)
			.allSatisfy((province) -> assertThat(province.slug()).isEqualTo(Slug.of(province.name())));
	}

	@Test
	void slugsFindTheirProvince() {
		assertThat(Province.bySlug("a-coruna")).map(Province::id).contains("15");
		assertThat(Province.bySlug("narnia")).isEmpty();
	}

	@Test
	void stationSlugStartsWithTheIdAndReadsBrandAndTown() {
		assertThat(PagesService.stationSlug(4375, "REPSOL", "L'Hospitalet de Llobregat"))
			.isEqualTo("4375-repsol-l-hospitalet-de-llobregat");
		assertThat(PagesService.stationSlug(12, "REPSOL", null)).isEqualTo("12-repsol");
	}

}
