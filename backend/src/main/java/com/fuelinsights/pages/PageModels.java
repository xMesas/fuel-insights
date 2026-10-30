package com.fuelinsights.pages;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import com.fuelinsights.prices.FuelView;

/**
 * What each search engine page needs, in one answer per page. {@code updatedAt} is always the Ministry's time of the
 * current prices: the pages show it next to every price, never a bare "today".
 */
public final class PageModels {

	private PageModels() {
	}

	/** A province or a town and the address of its page. */
	public record PlaceLink(String name, String slug) {
	}

	/** A published day: the latest one, or the one with the highest average of the history. */
	public record DayAverage(LocalDate date, BigDecimal averagePrice) {
	}

	/** One fuel now in an area, with its latest published day and its highest one. */
	public record Figures(BigDecimal averagePrice, BigDecimal minPrice, BigDecimal maxPrice, int stations,
			DayAverage latestDay, DayAverage highestDay) {
	}

	/** A station in a ranking: the cheapest of a fuel in Spain or in a province. */
	public record StationRow(int id, String slug, String name, String town, String townSlug, String province,
			String provinceSlug, BigDecimal price) {
	}

	/** {@code /precio-gasolina-hoy}, {@code /precio-diesel-hoy}. */
	public record FuelPage(OffsetDateTime updatedAt, FuelView fuel, Figures national, List<ProvinceRow> provinces,
			List<StationRow> cheapest) {

		/** Cheapest province first. */
		public record ProvinceRow(String name, String slug, BigDecimal averagePrice, BigDecimal minPrice,
				int stations) {
		}

	}

	/** {@code /gasolineras/{province}}: every fuel sold there, the cheapest stations of the main ones, its towns. */
	public record ProvincePage(OffsetDateTime updatedAt, PlaceLink province, List<ProvinceFuel> fuels,
			List<TownRow> towns) {

		public record ProvinceFuel(FuelView fuel, Figures figures, BigDecimal nationalAverage,
				List<StationRow> cheapest) {
		}

		/** Sorted as a Spanish reader expects. */
		public record TownRow(String name, String slug, int stations) {
		}

	}

	/** {@code /gasolineras/{province}/{town}}: every station of the town with all its prices. */
	public record TownPage(OffsetDateTime updatedAt, PlaceLink province, PlaceLink town, List<TownFuel> fuels,
			List<TownStation> stations) {

		public record TownFuel(FuelView fuel, BigDecimal averagePrice, BigDecimal minPrice, int stations,
				BigDecimal provinceAverage) {
		}

		/** {@code prices} by fuel code; {@code openingHours} as in the station card, or null if unreadable. */
		public record TownStation(int id, String slug, String name, String address, BigDecimal latitude,
				BigDecimal longitude, String schedule, List<List<List<String>>> openingHours,
				Map<String, BigDecimal> prices) {
		}

	}

	/**
	 * What {@code /gasolinera/{id}-{slug}} adds to the station card's answer ({@code /api/stations/{id}}): its own
	 * address, the links of its province and town, and the nearest stations with their prices.
	 */
	public record StationPage(int id, String slug, PlaceLink province, PlaceLink town, List<Nearby> nearby) {

		public record Nearby(int id, String slug, String name, String town, BigDecimal distanceKm,
				Map<String, BigDecimal> prices) {
		}

	}

}
