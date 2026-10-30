package com.fuelinsights.prices;

/**
 * Every fuel some Spanish station sells, with its name, the Ministry product id and price field, and the unit it is
 * sold by. The first four are the main ones (the price board); the order is the order the web lists them. Methanol
 * and ammonia are left out: the Ministry lists them, but no station sells them.
 */
public enum Fuel {

	GASOLEO_A("Gasóleo A", "Diésel", 4, "Precio Gasoleo A", Unit.LITRE, true),
	GASOLINA_95_E5("Gasolina 95 E5", "Gasolina 95", 1, "Precio Gasolina 95 E5", Unit.LITRE, true),
	GASOLEO_PREMIUM("Gasóleo Premium", "Diésel Premium", 5, "Precio Gasoleo Premium", Unit.LITRE, true),
	GASOLINA_98_E5("Gasolina 98 E5", "Gasolina 98", 3, "Precio Gasolina 98 E5", Unit.LITRE, true),
	GLP("GLP (autogás)", "GLP", 17, "Precio Gases licuados del petróleo", Unit.LITRE, false),
	GASOLINA_95_E5_PREMIUM("Gasolina 95 E5 Premium", "Gasolina 95 Premium", 20, "Precio Gasolina 95 E5 Premium",
			Unit.LITRE, false),
	DIESEL_RENOVABLE("Diésel renovable", "Diésel renovable", 27, "Precio Diésel Renovable", Unit.LITRE, false),
	GASOLEO_B("Gasóleo B (agrícola)", "Gasóleo agrícola", 6, "Precio Gasoleo B", Unit.LITRE, false),
	GNC("Gas natural comprimido", "GNC", 18, "Precio Gas Natural Comprimido", Unit.KILOGRAM, false),
	GNL("Gas natural licuado", "GNL", 19, "Precio Gas Natural Licuado", Unit.KILOGRAM, false),
	BIOGAS_COMPRIMIDO("Biogás comprimido", "Biogás comprimido", 31, "Precio Biogas Natural Comprimido", Unit.KILOGRAM,
			false),
	BIOGAS_LICUADO("Biogás licuado", "Biogás licuado", 32, "Precio Biogas Natural Licuado", Unit.KILOGRAM, false),
	GASOLINA_95_E10("Gasolina 95 E10", "Gasolina 95 E10", 23, "Precio Gasolina 95 E10", Unit.LITRE, false),
	GASOLINA_98_E10("Gasolina 98 E10", "Gasolina 98 E10", 21, "Precio Gasolina 98 E10", Unit.LITRE, false),
	GASOLINA_RENOVABLE("Gasolina renovable", "Gasolina renovable", 28, "Precio Gasolina Renovable", Unit.LITRE, false),
	BIODIESEL("Biodiésel", "Biodiésel", 8, "Precio Biodiesel", Unit.LITRE, false),
	GASOLINA_95_E85("Gasolina 95 E85", "Gasolina E85", 25, "Precio Gasolina 95 E85", Unit.LITRE, false),
	GASOLINA_95_E25("Gasolina 95 E25", "Gasolina E25", 24, "Precio Gasolina 95 E25", Unit.LITRE, false),
	BIOETANOL("Bioetanol", "Bioetanol", 16, "Precio Bioetanol", Unit.LITRE, false),
	HIDROGENO("Hidrógeno", "Hidrógeno", 22, "Precio Hidrogeno", Unit.KILOGRAM, false),
	ADBLUE("AdBlue", "AdBlue", 26, "Precio Adblue", Unit.LITRE, false);

	/** How the price is quoted: euros per litre, or per kilogram for the gases. */
	public enum Unit {

		LITRE("l"), KILOGRAM("kg");

		private final String symbol;

		Unit(String symbol) {
			this.symbol = symbol;
		}

		public String symbol() {
			return this.symbol;
		}

	}

	private final String displayName;

	private final String shortName;

	private final int ministryProductId;

	private final String ministryField;

	private final Unit unit;

	private final boolean main;

	Fuel(String displayName, String shortName, int ministryProductId, String ministryField, Unit unit, boolean main) {
		this.displayName = displayName;
		this.shortName = shortName;
		this.ministryProductId = ministryProductId;
		this.ministryField = ministryField;
		this.unit = unit;
		this.main = main;
	}

	public String displayName() {
		return this.displayName;
	}

	/** The name drivers use ("Diésel" for the Ministry's "Gasóleo A"): buttons and short labels. */
	public String shortName() {
		return this.shortName;
	}

	public int ministryProductId() {
		return this.ministryProductId;
	}

	/** The key of this fuel's price in the Ministry station JSON. */
	public String ministryField() {
		return this.ministryField;
	}

	public Unit unit() {
		return this.unit;
	}

	public boolean main() {
		return this.main;
	}

}
