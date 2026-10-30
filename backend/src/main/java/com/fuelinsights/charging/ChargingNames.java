package com.fuelinsights.charging;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * The words the web shows for the feed's codes and legal names. The feed names operators as companies
 * ({@code IBERDROLA CLIENTES S.A.U}) and connectors as standards ({@code iec62196T2COMBO}); drivers know them as
 * Iberdrola and CCS2.
 */
final class ChargingNames {

	// The operators of about nine in ten sites, by the start of their legal name.
	private static final List<Map.Entry<String, String>> BRANDS = List.of(Map.entry("ENDESA X", "Endesa X Way"),
			Map.entry("IBERDROLA", "Iberdrola"), Map.entry("REPSOL", "Repsol"), Map.entry("ETECNIC", "Etecnic"),
			Map.entry("EDP ", "EDP"), Map.entry("ERANOVUM", "Eranovum"), Map.entry("TOTALENERGIES", "TotalEnergies"),
			Map.entry("WENEA", "Wenea"), Map.entry("FENIE", "Fenie Energía"), Map.entry("PLENOIL", "Plenoil"),
			Map.entry("ACCIONA", "Acciona"), Map.entry("GALP", "Galp"), Map.entry("MAKSU", "Maksu"),
			Map.entry("(ZUNDER)", "Zunder"), Map.entry("ZUNDER", "Zunder"), Map.entry("TESLA", "Tesla"),
			Map.entry("QWELLO", "Qwello"), Map.entry("CEPSA", "Cepsa"), Map.entry("IONITY", "Ionity"),
			Map.entry("CENTROS COMERCIALES CARREFOUR", "Carrefour"), Map.entry("BONPREU", "Bonpreu"));

	private static final Pattern LEGAL_FORM = Pattern
		.compile("[\\s,]+(S\\.?\\s?L\\.?\\s?U\\.?|S\\.?\\s?A\\.?\\s?U\\.?|S\\.?\\s?R\\.?\\s?L\\.?|S\\.?\\s?L\\.?|S\\.?\\s?A\\.?)$",
				Pattern.CASE_INSENSITIVE);

	private static final List<String> LOWER_WORDS = List.of("de", "del", "la", "las", "el", "los", "y", "i", "en");

	private static final Map<String, String> CONNECTORS = Map.ofEntries(Map.entry("iec62196T2COMBO", "CCS2"),
			Map.entry("iec62196T2", "Tipo 2"), Map.entry("chademo", "CHAdeMO"), Map.entry("iec62196T1COMBO", "CCS1"),
			Map.entry("iec62196T1", "Tipo 1"), Map.entry("iec62196T3A", "Tipo 3A"), Map.entry("iec62196T3C", "Tipo 3C"),
			Map.entry("domesticF", "Schuko"), Map.entry("domesticE", "Enchufe tipo E"),
			Map.entry("domesticA", "Enchufe tipo A"), Map.entry("domesticL", "Enchufe tipo L"),
			Map.entry("iec60309x2single16", "CEE monofásico"), Map.entry("iec60309x2three32", "CEE trifásico"));

	private static final Map<String, String> PAYMENT = Map.of("apps", "App", "rfid", "Tarjeta RFID", "creditCard",
			"Tarjeta bancaria", "debitCard", "Tarjeta bancaria", "nfc", "Móvil (NFC)", "pinpad", "Código PIN");

	private ChargingNames() {
	}

	static String operator(String legalName) {
		if (legalName == null || legalName.isBlank()) {
			return null;
		}
		String name = legalName.trim();
		String upper = name.toUpperCase(Locale.ROOT);
		for (Map.Entry<String, String> brand : BRANDS) {
			if (upper.startsWith(brand.getKey())) {
				return brand.getValue();
			}
		}
		String withoutForm = LEGAL_FORM.matcher(name).replaceAll("").trim();
		return name.equals(name.toUpperCase(Locale.ROOT)) ? titleCase(withoutForm) : withoutForm;
	}

	/** The site's own name only when people can read it: many are internal codes such as {@code E-28-Getafe-004}. */
	static String siteName(String name) {
		if (name == null || name.isBlank() || !name.trim().contains(" ")) {
			return null;
		}
		return name.trim();
	}

	static String connector(String code) {
		return CONNECTORS.getOrDefault(code, code);
	}

	static List<String> payment(List<String> codes) {
		return codes.stream().map(PAYMENT::get).filter(Objects::nonNull).distinct().toList();
	}

	private static String titleCase(String text) {
		return Arrays.stream(text.toLowerCase(Locale.ROOT).split(" "))
			.map((word) -> (word.isEmpty() || LOWER_WORDS.contains(word)) ? word
					: word.substring(0, 1).toUpperCase(Locale.ROOT) + word.substring(1))
			.collect(Collectors.joining(" "));
	}

}
