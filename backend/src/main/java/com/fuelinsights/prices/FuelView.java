package com.fuelinsights.prices;

/**
 * A fuel as the web shows it: the Ministry's name, the short name drivers use, its unit ({@code l} or {@code kg}) and
 * whether it is one of the four main ones.
 */
public record FuelView(String code, String name, String shortName, String unit, boolean main) {

	public static FuelView of(Fuel fuel) {
		return new FuelView(fuel.name(), fuel.displayName(), fuel.shortName(), fuel.unit().symbol(), fuel.main());
	}

}
