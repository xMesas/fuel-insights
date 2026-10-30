package com.fuelinsights.ingestion;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/**
 * Turns the free-text sign of a station into a brand: first an exact match in {@code brands.csv}, then a known brand
 * that appears as a whole word in the sign ("E.S. REPSOL ALCALA" is REPSOL), otherwise INDEPENDENT.
 */
@Component
class BrandNormalizer {

	static final String INDEPENDENT = "INDEPENDENT";

	private final Map<String, String> brandBySign = new HashMap<>();

	private final List<KnownBrand> knownBrands;

	BrandNormalizer(@Value("classpath:brands.csv") Resource csv) {
		try (BufferedReader reader = new BufferedReader(
				new InputStreamReader(csv.getInputStream(), StandardCharsets.UTF_8))) {
			reader.lines().skip(1).filter((line) -> !line.isBlank()).forEach((line) -> {
				String[] columns = splitCsvLine(line);
				this.brandBySign.put(key(columns[0]), columns[1].trim());
			});
		}
		catch (IOException ex) {
			throw new UncheckedIOException("Cannot read " + csv, ex);
		}
		// Longest names first, so "PETROL & GO" wins over a shorter brand inside it.
		this.knownBrands = this.brandBySign.values()
			.stream()
			.distinct()
			.filter((brand) -> !brand.equals(INDEPENDENT))
			.sorted(Comparator.comparingInt(String::length).reversed())
			.map(KnownBrand::new)
			.toList();
	}

	String normalize(String sign) {
		String key = key(sign);
		String exact = this.brandBySign.get(key);
		if (exact != null) {
			return exact;
		}
		return this.knownBrands.stream()
			.filter((brand) -> brand.pattern().matcher(key).find())
			.map(KnownBrand::name)
			.findFirst()
			.orElse(INDEPENDENT);
	}

	private static String key(String sign) {
		return sign.trim().toUpperCase(Locale.ROOT);
	}

	// Two columns; the first one may be quoted because some signs contain a comma.
	private static String[] splitCsvLine(String line) {
		if (line.startsWith("\"")) {
			int closingQuote = line.indexOf("\",", 1);
			return new String[] { line.substring(1, closingQuote), line.substring(closingQuote + 2) };
		}
		int comma = line.lastIndexOf(',');
		return new String[] { line.substring(0, comma), line.substring(comma + 1) };
	}

	private record KnownBrand(String name, Pattern pattern) {

		KnownBrand(String name) {
			this(name, Pattern.compile("(^|[^\\p{L}\\p{N}])" + Pattern.quote(name) + "([^\\p{L}\\p{N}]|$)"));
		}

	}

}
