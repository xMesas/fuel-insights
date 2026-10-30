package com.fuelinsights.pages;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The 52 provinces as people search for them, with the address of their page. The Ministry's register names
 * ({@code CORUÑA (A)}, {@code BALEARS (ILLES)}, {@code VALENCIA / VALÈNCIA}) are not how anyone writes them, and an
 * address must never change once search engines know it, so names and slugs are fixed here by hand.
 */
public record Province(String id, String name, String slug) {

	public static final List<Province> ALL = List.of(new Province("01", "Álava", "alava"),
			new Province("02", "Albacete", "albacete"), new Province("03", "Alicante", "alicante"),
			new Province("04", "Almería", "almeria"), new Province("05", "Ávila", "avila"),
			new Province("06", "Badajoz", "badajoz"), new Province("07", "Illes Balears", "illes-balears"),
			new Province("08", "Barcelona", "barcelona"), new Province("09", "Burgos", "burgos"),
			new Province("10", "Cáceres", "caceres"), new Province("11", "Cádiz", "cadiz"),
			new Province("12", "Castellón", "castellon"), new Province("13", "Ciudad Real", "ciudad-real"),
			new Province("14", "Córdoba", "cordoba"), new Province("15", "A Coruña", "a-coruna"),
			new Province("16", "Cuenca", "cuenca"), new Province("17", "Girona", "girona"),
			new Province("18", "Granada", "granada"), new Province("19", "Guadalajara", "guadalajara"),
			new Province("20", "Gipuzkoa", "gipuzkoa"), new Province("21", "Huelva", "huelva"),
			new Province("22", "Huesca", "huesca"), new Province("23", "Jaén", "jaen"),
			new Province("24", "León", "leon"), new Province("25", "Lleida", "lleida"),
			new Province("26", "La Rioja", "la-rioja"), new Province("27", "Lugo", "lugo"),
			new Province("28", "Madrid", "madrid"), new Province("29", "Málaga", "malaga"),
			new Province("30", "Murcia", "murcia"), new Province("31", "Navarra", "navarra"),
			new Province("32", "Ourense", "ourense"), new Province("33", "Asturias", "asturias"),
			new Province("34", "Palencia", "palencia"), new Province("35", "Las Palmas", "las-palmas"),
			new Province("36", "Pontevedra", "pontevedra"), new Province("37", "Salamanca", "salamanca"),
			new Province("38", "Santa Cruz de Tenerife", "santa-cruz-de-tenerife"),
			new Province("39", "Cantabria", "cantabria"), new Province("40", "Segovia", "segovia"),
			new Province("41", "Sevilla", "sevilla"), new Province("42", "Soria", "soria"),
			new Province("43", "Tarragona", "tarragona"), new Province("44", "Teruel", "teruel"),
			new Province("45", "Toledo", "toledo"), new Province("46", "Valencia", "valencia"),
			new Province("47", "Valladolid", "valladolid"), new Province("48", "Bizkaia", "bizkaia"),
			new Province("49", "Zamora", "zamora"), new Province("50", "Zaragoza", "zaragoza"),
			new Province("51", "Ceuta", "ceuta"), new Province("52", "Melilla", "melilla"));

	private static final Map<String, Province> BY_ID = index(Province::id);

	private static final Map<String, Province> BY_SLUG = index(Province::slug);

	public static Optional<Province> byId(String id) {
		return Optional.ofNullable(BY_ID.get(id));
	}

	public static Optional<Province> bySlug(String slug) {
		return Optional.ofNullable(BY_SLUG.get(slug));
	}

	private static Map<String, Province> index(Function<Province, String> key) {
		return ALL.stream().collect(Collectors.toUnmodifiableMap(key, Function.identity()));
	}

}
