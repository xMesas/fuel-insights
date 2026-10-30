package com.fuelinsights.stations;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The opening hours the Ministry writes as text ({@code L-V: 06:00-22:00; S-D: 07:00-14:00}), read into one list of
 * time ranges per day, Monday first. A text this cannot read with confidence gives nothing: the web then shows the
 * text as it is instead of guessing "closed".
 */
public final class OpeningHours {

	private static final String DAYS = "LMXJVSD";

	private static final Pattern DAY_PART = Pattern.compile("([LMXJVSD])(?:-([LMXJVSD]))?:\\s*(.+)");

	private static final Pattern RANGE = Pattern.compile("(\\d{1,2}):(\\d{2})-(\\d{1,2}):(\\d{2})");

	private OpeningHours() {
	}

	/**
	 * Seven lists, Monday to Sunday, of {@code [from, to]} as {@code HH:mm}. {@code 24:00} closes at midnight, and a
	 * range that ends before it starts goes on past midnight. An empty day is closed.
	 */
	public static Optional<List<List<List<String>>>> parse(String text) {
		if (text == null || text.isBlank()) {
			return Optional.empty();
		}
		List<List<List<String>>> week = new ArrayList<>();
		for (int day = 0; day < 7; day++) {
			week.add(new ArrayList<>());
		}
		int partsNamingOneDay = 0;
		String[] parts = text.trim().split("\\s*;\\s*");
		for (String part : parts) {
			Matcher dayPart = DAY_PART.matcher(part);
			if (!dayPart.matches()) {
				return Optional.empty();
			}
			int first = DAYS.indexOf(dayPart.group(1));
			int last = (dayPart.group(2) != null) ? DAYS.indexOf(dayPart.group(2)) : first;
			if (last < first) {
				return Optional.empty();
			}
			if (first == last) {
				partsNamingOneDay++;
			}
			Optional<List<List<String>>> ranges = ranges(dayPart.group(3));
			if (ranges.isEmpty()) {
				return Optional.empty();
			}
			for (int day = first; day <= last; day++) {
				week.get(day).addAll(ranges.get());
			}
		}
		// About 200 stations write only "L: 24H": surely "every day", but that is a guess, so it stays unread.
		if (parts.length == 1 && partsNamingOneDay == 1) {
			return Optional.empty();
		}
		return Optional.of(week);
	}

	private static Optional<List<List<String>>> ranges(String text) {
		if (text.trim().equalsIgnoreCase("24H")) {
			return Optional.of(List.of(List.of("00:00", "24:00")));
		}
		List<List<String>> ranges = new ArrayList<>();
		for (String range : text.trim().split("\\s+y\\s+")) {
			Matcher matcher = RANGE.matcher(range.trim());
			if (!matcher.matches()) {
				return Optional.empty();
			}
			String from = time(matcher.group(1), matcher.group(2));
			String to = time(matcher.group(3), matcher.group(4));
			if (from == null || to == null) {
				return Optional.empty();
			}
			// "23:59" and "00:00" as an end both mean midnight.
			if (to.equals("23:59") || (to.equals("00:00") && !from.equals("00:00"))) {
				to = "24:00";
			}
			ranges.add(List.of(from, to));
		}
		return Optional.of(ranges);
	}

	private static String time(String hours, String minutes) {
		int hour = Integer.parseInt(hours);
		int minute = Integer.parseInt(minutes);
		if (hour > 24 || minute > 59 || (hour == 24 && minute > 0)) {
			return null;
		}
		return "%02d:%02d".formatted(hour, minute);
	}

}
