package com.fuelinsights.shared;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Names as they go in a web address: lower case, no accents, words joined by hyphens. {@code L'Hospitalet de
 * Llobregat} becomes {@code l-hospitalet-de-llobregat}, {@code Coruña} becomes {@code coruna}.
 */
public final class Slug {

	private static final Pattern MARKS = Pattern.compile("\\p{M}+");

	private static final Pattern SEPARATORS = Pattern.compile("[^a-z0-9]+");

	private static final Pattern EDGES = Pattern.compile("^-|-$");

	private Slug() {
	}

	public static String of(String name) {
		// The Catalan middle dot joins one word (paral·lel), so it goes away instead of splitting it.
		String plain = MARKS.matcher(Normalizer.normalize(name.replace("·", ""), Normalizer.Form.NFD)).replaceAll("");
		String joined = SEPARATORS.matcher(plain.toLowerCase(Locale.ROOT)).replaceAll("-");
		return EDGES.matcher(joined).replaceAll("");
	}

	/** The slug cut at a word boundary, so a long station name does not make a long address. */
	public static String of(String name, int maxLength) {
		String slug = of(name);
		if (slug.length() <= maxLength) {
			return slug;
		}
		int cut = slug.lastIndexOf('-', maxLength);
		return slug.substring(0, (cut > 0) ? cut : maxLength);
	}

}
