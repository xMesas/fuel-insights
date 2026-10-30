package com.fuelinsights.charging;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ChargingHoursTest {

	private static final List<List<String>> ALL_DAY = List.of(List.of("00:00", "24:00"));

	@Test
	void daysInAnyOrderLandOnTheirWeekday() {
		var week = ChargingHours.parse("Miercoles (08:30 - 17:30) Lunes (07:00 - 22:00) ").orElseThrow();

		assertThat(week.get(0)).containsExactly(List.of("07:00", "22:00"));
		assertThat(week.get(2)).containsExactly(List.of("08:30", "17:30"));
	}

	@Test
	void dayTheTextDoesNotNameIsClosed() {
		var week = ChargingHours.parse("Lunes (07:00 - 22:00)").orElseThrow();

		assertThat(week.subList(1, 7)).allSatisfy((day) -> assertThat(day).isEmpty());
	}

	@Test
	void midnightToMidnightIsTheWholeDay() {
		assertThat(ChargingHours.parse("Domingo (00:00 - 00:00)").orElseThrow().get(6)).isEqualTo(ALL_DAY);
	}

	@Test
	void endingAt2359IsTheWholeDay() {
		assertThat(ChargingHours.parse("Sabado (00:00 - 23:59)").orElseThrow().get(5)).isEqualTo(ALL_DAY);
	}

	@Test
	void textWithAnUnnamedRangeIsNotRead() {
		assertThat(ChargingHours.parse("Martes (07:00 - 23:59)  (00:00 - 01:00) Domingo (00:00 - 01:00)")).isEmpty();
	}

	@Test
	void emptyTextIsNotRead() {
		assertThat(ChargingHours.parse("  ")).isEmpty();
		assertThat(ChargingHours.parse(null)).isEmpty();
	}

}
