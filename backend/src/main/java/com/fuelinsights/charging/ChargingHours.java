package com.fuelinsights.charging;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The opening hours of a charging site, written in the feed as one range per day in any order:
 * {@code Miercoles (08:30 - 17:30) Lunes (00:00 - 23:59) …}. Read into the same shape as the fuel stations' hours
 * (seven lists of {@code [from, to]}, Monday first), so the web reads both alike. A day the text does not name is
 * closed; a text that does not follow the pattern gives nothing.
 */
final class ChargingHours {

	private static final List<String> DAYS = List.of("Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado",
			"Domingo");

	private static final Pattern DAY = Pattern
		.compile("(Lunes|Martes|Mi[eé]rcoles|Jueves|Viernes|S[aá]bado|Domingo) \\((\\d{2}):(\\d{2}) - (\\d{2}):(\\d{2})\\)\\s*");

	private ChargingHours() {
	}

	static Optional<List<List<List<String>>>> parse(String text) {
		if (text == null || text.isBlank()) {
			return Optional.empty();
		}
		List<List<List<String>>> week = new ArrayList<>();
		for (int day = 0; day < 7; day++) {
			week.add(new ArrayList<>());
		}
		String trimmed = text.trim();
		Matcher matcher = DAY.matcher(trimmed);
		int position = 0;
		while (position < trimmed.length()) {
			if (!matcher.find(position) || matcher.start() != position) {
				return Optional.empty();
			}
			String from = matcher.group(2) + ":" + matcher.group(3);
			String to = matcher.group(4) + ":" + matcher.group(5);
			// The feed closes a whole day as 23:59, and writes "00:00 - 00:00" for a day that never closes.
			if (to.equals("23:59") || to.equals("00:00")) {
				to = "24:00";
			}
			week.get(DAYS.indexOf(plain(matcher.group(1)))).add(List.of(from, to));
			position = matcher.end();
		}
		return Optional.of(week);
	}

	private static String plain(String day) {
		return day.replace('é', 'e').replace('á', 'a');
	}

}
