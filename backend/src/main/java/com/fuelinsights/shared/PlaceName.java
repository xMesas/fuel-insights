package com.fuelinsights.shared;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Town names as people write them. Official registers put the article at the end, in brackets or after a comma, to
 * sort them: {@code Rozas de Madrid (Las)} is shown as {@code Las Rozas de Madrid}, {@code Hospitalet de Llobregat, L'}
 * as {@code L'Hospitalet de Llobregat}.
 */
public final class PlaceName {

	// Spanish, Catalan, Valencian, Balearic and Galician articles, and the "Illes" of "Balears, Illes".
	private static final String ARTICLE = "(el|la|los|las|l'|els|les|lo|es|sa|ses|so|a|o|as|os|illes)";

	private static final Pattern TRAILING_ARTICLE = Pattern
		.compile("^(.+?)(?:\\s*\\(" + ARTICLE + "\\)|,\\s*" + ARTICLE + ")$", Pattern.CASE_INSENSITIVE);

	private PlaceName() {
	}

	public static String display(String registerName) {
		String name = registerName.trim();
		Matcher matcher = TRAILING_ARTICLE.matcher(name);
		if (!matcher.matches()) {
			return name;
		}
		String article = ((matcher.group(2) != null) ? matcher.group(2) : matcher.group(3)).toLowerCase(Locale.ROOT);
		String capitalised = article.substring(0, 1).toUpperCase(Locale.ROOT) + article.substring(1);
		return capitalised + (article.endsWith("'") ? "" : " ") + matcher.group(1);
	}

}
