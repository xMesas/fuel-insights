package com.fuelinsights.stations;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class OpeningHoursTest {

	private static final List<String> ALL_DAY = List.of("00:00", "24:00");

	@Test
	void openEveryDayAllDay() {
		assertThat(OpeningHours.parse("L-D: 24H")).hasValueSatisfying((week) -> assertThat(week).hasSize(7)
			.allSatisfy((day) -> assertThat(day).containsExactly(ALL_DAY)));
	}

	@Test
	void weekdaysAndWeekendHaveTheirOwnHours() {
		assertThat(OpeningHours.parse("L-V: 06:00-22:00; S-D: 07:00-14:00")).hasValueSatisfying((week) -> {
			assertThat(week.get(0)).containsExactly(List.of("06:00", "22:00"));
			assertThat(week.get(4)).containsExactly(List.of("06:00", "22:00"));
			assertThat(week.get(5)).containsExactly(List.of("07:00", "14:00"));
			assertThat(week.get(6)).containsExactly(List.of("07:00", "14:00"));
		});
	}

	@Test
	void dayMissingFromTheTextIsClosed() {
		assertThat(OpeningHours.parse("L-S: 07:00-22:00")).hasValueSatisfying((week) -> assertThat(week.get(6)).isEmpty());
	}

	@Test
	void splitDayHasTwoRanges() {
		assertThat(OpeningHours.parse("L-V: 08:30-13:30 y 15:00-19:00; S: 09:00-13:00"))
			.hasValueSatisfying((week) -> assertThat(week.get(2)).containsExactly(List.of("08:30", "13:30"),
					List.of("15:00", "19:00")));
	}

	@Test
	void oneDigitHourIsRead() {
		assertThat(OpeningHours.parse("L-D: 7:00-23:00"))
			.hasValueSatisfying((week) -> assertThat(week.get(3)).containsExactly(List.of("07:00", "23:00")));
	}

	@Test
	void closingAtMidnightIsWrittenAs24() {
		assertThat(OpeningHours.parse("L-D: 06:00-00:00"))
			.hasValueSatisfying((week) -> assertThat(week.get(0)).containsExactly(List.of("06:00", "24:00")));
		assertThat(OpeningHours.parse("L-D: 00:00-23:59"))
			.hasValueSatisfying((week) -> assertThat(week.get(0)).containsExactly(ALL_DAY));
	}

	// "L: 24H" alone almost surely means every day, but saying "closed" on a guess would send drivers away.
	@ParameterizedTest
	@ValueSource(strings = { "L: 24H", "L: 06:00-22:00", "", "Consultar", "L-D: 25:00-26:00", "D-L: 24H" })
	void textThatCannotBeReadWithConfidenceGivesNothing(String text) {
		assertThat(OpeningHours.parse(text)).isEmpty();
	}

}
