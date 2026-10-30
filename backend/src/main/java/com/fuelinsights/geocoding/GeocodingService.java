package com.fuelinsights.geocoding;

import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import com.fuelinsights.geocoding.CartoCiudadClient.Candidate;

/**
 * Addresses for the search box. Results are kept in memory for a while: people search the same streets, and the
 * public geocoder deserves few calls. Nothing searched is logged or stored anywhere else.
 */
@Service
class GeocodingService {

	private static final int RESULTS = 6;

	// Up to this many answers are remembered; the oldest go first.
	private static final int CACHE_SIZE = 2_000;

	// Addresses first, then streets, towns and places; postcodes are left out (CartoCiudad cannot place them).
	private static final List<String> ORDER = List.of("portal", "callejero", "poblacion", "Municipio", "carretera",
			"toponimo");

	private static final Set<String> SMALL_WORDS = Set.of("de", "del", "la", "las", "el", "els", "los", "les", "y", "i",
			"a", "en", "sa", "ses", "es");

	private static final Pattern WORD = Pattern.compile("[\\p{L}\\p{M}][\\p{L}\\p{M}'·]*");

	private final CartoCiudadClient cartoCiudad;

	private final Map<String, List<GeoPlace>> searches = lru();

	private final Map<String, Optional<GeoPlace>> points = lru();

	GeocodingService(CartoCiudadClient cartoCiudad) {
		this.cartoCiudad = cartoCiudad;
	}

	List<GeoPlace> search(String text) {
		String key = text.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
		return remember(this.searches, key, () -> this.cartoCiudad.candidates(key, RESULTS * 2)
			.stream()
			.filter((candidate) -> ORDER.contains(candidate.type()))
			.sorted(Comparator.comparingInt((Candidate candidate) -> ORDER.indexOf(candidate.type())))
			.limit(RESULTS)
			.map(GeocodingService::place)
			.toList());
	}

	/** The point of a result that came without one; empty when CartoCiudad cannot place it. */
	Optional<GeoPlace> point(String id, String type) {
		return remember(this.points, type + "|" + id, () -> this.cartoCiudad.find(id, type)
			.filter(Candidate::hasPoint)
			.map(GeocodingService::place));
	}

	static GeoPlace place(Candidate candidate) {
		return new GeoPlace(candidate.id(), candidate.type(), kind(candidate.type()), label(candidate.address()),
				candidate.muni(), candidate.province(), candidate.hasPoint() ? candidate.lat() : null,
				candidate.hasPoint() ? candidate.lng() : null);
	}

	/** CartoCiudad writes streets in capitals ({@code CALLE PORTUGAL 55}): read them as people write them. */
	static String label(String address) {
		if (address == null) {
			return "";
		}
		Matcher word = WORD.matcher(address);
		StringBuilder label = new StringBuilder();
		boolean first = true;
		while (word.find()) {
			String text = word.group();
			String lower = text.toLowerCase(Locale.forLanguageTag("es"));
			boolean shout = text.equals(text.toUpperCase(Locale.forLanguageTag("es")));
			String replacement = !shout ? text : (!first && SMALL_WORDS.contains(lower)) ? lower : capitalise(lower, first);
			word.appendReplacement(label, Matcher.quoteReplacement(replacement));
			first = false;
		}
		word.appendTail(label);
		return label.toString();
	}

	// D'ARAGÓ reads d'Aragó: the elided article stays small unless it starts the name.
	private static String capitalise(String lower, boolean first) {
		int apostrophe = lower.indexOf('\'');
		if (apostrophe > 0 && apostrophe < lower.length() - 1) {
			String article = first ? Character.toUpperCase(lower.charAt(0)) + lower.substring(1, apostrophe + 1)
					: lower.substring(0, apostrophe + 1);
			return article + Character.toUpperCase(lower.charAt(apostrophe + 1)) + lower.substring(apostrophe + 2);
		}
		return Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
	}

	private static String kind(String type) {
		return switch (type) {
			case "portal" -> "Dirección";
			case "callejero" -> "Calle";
			case "poblacion", "Municipio" -> "Municipio";
			case "carretera" -> "Carretera";
			default -> "Lugar";
		};
	}

	private static <V> V remember(Map<String, V> cache, String key, Supplier<V> load) {
		synchronized (cache) {
			V known = cache.get(key);
			if (known != null) {
				return known;
			}
		}
		V value = load.get();
		synchronized (cache) {
			cache.put(key, value);
		}
		return value;
	}

	private static <V> Map<String, V> lru() {
		return Collections.synchronizedMap(new LinkedHashMap<>(256, 0.75f, true) {

			@Override
			protected boolean removeEldestEntry(Map.Entry<String, V> eldest) {
				return size() > CACHE_SIZE;
			}

		});
	}

	/**
	 * A result for the search box. {@code latitude} and {@code longitude} are null for towns and streets without a
	 * number: the web asks {@code /api/geocode/point} for them when one is chosen.
	 */
	record GeoPlace(String id, String type, String kind, String label, String town, String province, Double latitude,
			Double longitude) {
	}

}
