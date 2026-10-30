package com.fuelinsights.pages;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Collator;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import com.fuelinsights.pages.PageModels.DayAverage;
import com.fuelinsights.pages.PageModels.Figures;
import com.fuelinsights.pages.PageModels.FuelPage;
import com.fuelinsights.pages.PageModels.FuelPage.ProvinceRow;
import com.fuelinsights.pages.PageModels.PlaceLink;
import com.fuelinsights.pages.PageModels.ProvincePage;
import com.fuelinsights.pages.PageModels.ProvincePage.ProvinceFuel;
import com.fuelinsights.pages.PageModels.ProvincePage.TownRow;
import com.fuelinsights.pages.PageModels.StationPage;
import com.fuelinsights.pages.PageModels.StationPage.Nearby;
import com.fuelinsights.pages.PageModels.StationRow;
import com.fuelinsights.pages.PageModels.TownPage;
import com.fuelinsights.pages.PageModels.TownPage.TownFuel;
import com.fuelinsights.pages.PageModels.TownPage.TownStation;
import com.fuelinsights.pages.PagesRepository.CurrentFigures;
import com.fuelinsights.pages.PagesRepository.FuelDay;
import com.fuelinsights.pages.PagesRepository.RankedStation;
import com.fuelinsights.pages.PagesRepository.StationDetails;
import com.fuelinsights.pages.PagesRepository.StationPrice;
import com.fuelinsights.pages.PagesRepository.TownCount;
import com.fuelinsights.prices.DataVersion;
import com.fuelinsights.prices.Fuel;
import com.fuelinsights.prices.FuelView;
import com.fuelinsights.shared.NoDataException;
import com.fuelinsights.shared.PlaceName;
import com.fuelinsights.shared.Slug;
import com.fuelinsights.stations.OpeningHours;

/**
 * Builds each search engine page from one REPEATABLE READ snapshot, so an import that replaces the prices in the
 * middle cannot mix two lists in one page.
 */
@Service
class PagesService {

	private static final ZoneId MADRID = ZoneId.of("Europe/Madrid");

	private static final String SPAIN = "ES";

	private static final int RANKING_SIZE = 10;

	private static final int NEARBY_SIZE = 6;

	private static final Collator SPANISH = Collator.getInstance(Locale.forLanguageTag("es"));

	private final PagesRepository repository;

	private final DataVersion dataVersion;

	PagesService(PagesRepository repository, DataVersion dataVersion) {
		this.repository = repository;
		this.dataVersion = dataVersion;
	}

	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	FuelPage fuelPage(Fuel fuel) {
		OffsetDateTime updatedAt = updatedAt();
		Figures national = figures(null, SPAIN).get(fuel.name());
		if (national == null) {
			throw new NoDataException("No station sells " + fuel.displayName() + " now.");
		}
		List<ProvinceRow> provinces = this.repository.provinces(fuel)
			.stream()
			.sorted(Comparator.comparing(PagesRepository.ProvinceFigures::averagePrice))
			.map((row) -> {
				Province province = province(row.provinceId());
				return new ProvinceRow(province.name(), province.slug(), row.averagePrice(), row.minPrice(),
						row.stations());
			})
			.toList();
		return new FuelPage(updatedAt, FuelView.of(fuel), national, provinces, ranking(fuel, null));
	}

	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	ProvincePage provincePage(String slug) {
		Province province = provinceBySlug(slug);
		OffsetDateTime updatedAt = updatedAt();
		Map<String, Figures> figures = figures(province.id(), province.id());
		Map<String, CurrentFigures> national = byFuel(this.repository.currentFigures(null), CurrentFigures::fuel);
		List<ProvinceFuel> fuels = Arrays.stream(Fuel.values())
			.filter((fuel) -> figures.containsKey(fuel.name()))
			.map((fuel) -> new ProvinceFuel(FuelView.of(fuel), figures.get(fuel.name()),
					national.get(fuel.name()).averagePrice(),
					fuel.main() ? ranking(fuel, province.id()) : List.of()))
			.toList();
		List<TownRow> towns = towns(province.id()).values()
			.stream()
			.map((town) -> new TownRow(town.name(), town.slug(), town.stations()))
			.sorted(Comparator.comparing(TownRow::name, SPANISH))
			.toList();
		return new ProvincePage(updatedAt, link(province), fuels, towns);
	}

	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	TownPage townPage(String provinceSlug, String townSlug) {
		Province province = provinceBySlug(provinceSlug);
		Town town = Optional.ofNullable(towns(province.id()).get(townSlug))
			.orElseThrow(() -> new NoDataException("No station of " + province.name() + " is in " + townSlug + "."));
		OffsetDateTime updatedAt = updatedAt();
		List<StationDetails> stations = this.repository.townStations(province.id(), town.registerNames());
		Map<Integer, Map<String, BigDecimal>> prices = prices(stations.stream().map(StationDetails::id).toList());
		Map<String, CurrentFigures> provinceFigures = byFuel(this.repository.currentFigures(province.id()),
				CurrentFigures::fuel);
		List<TownFuel> fuels = Arrays.stream(Fuel.values()).flatMap((fuel) -> {
			List<BigDecimal> sold = prices.values()
				.stream()
				.map((byFuel) -> byFuel.get(fuel.name()))
				.filter((price) -> price != null)
				.toList();
			if (sold.isEmpty()) {
				return Stream.empty();
			}
			BigDecimal sum = sold.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
			BigDecimal average = sum.divide(BigDecimal.valueOf(sold.size()), 3, RoundingMode.HALF_UP);
			BigDecimal min = sold.stream().min(Comparator.naturalOrder()).orElseThrow();
			return Stream.of(new TownFuel(FuelView.of(fuel), average, min, sold.size(),
					provinceFigures.get(fuel.name()).averagePrice()));
		}).toList();
		List<TownStation> rows = stations.stream()
			.map((station) -> new TownStation(station.id(),
					stationSlug(station.id(), station.name(), town.name()), station.name(), station.address(),
					station.latitude(), station.longitude(), station.schedule(),
					OpeningHours.parse(station.schedule()).orElse(null),
					prices.getOrDefault(station.id(), Map.of())))
			.toList();
		return new TownPage(updatedAt, link(province), new PlaceLink(town.name(), town.slug()), fuels, rows);
	}

	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	StationPage stationPage(int id) {
		StationDetails station = this.repository.station(id)
			.orElseThrow(() -> new NoDataException("The station " + id + " is not known."));
		Province province = province(station.provinceId());
		PlaceLink town = townLink(station.municipality());
		List<Nearby> nearby = List.of();
		if (station.latitude() != null && station.longitude() != null) {
			var around = this.repository.nearby(id, station.latitude(), station.longitude(), NEARBY_SIZE);
			Map<Integer, Map<String, BigDecimal>> prices = prices(around.stream().map((row) -> row.id()).toList());
			nearby = around.stream()
				.map((row) -> new Nearby(row.id(), stationSlug(row.id(), row.name(), townName(row.municipality())),
						row.name(), townName(row.municipality()), row.distanceKm(),
						prices.getOrDefault(row.id(), Map.of())))
				.toList();
		}
		return new StationPage(id, stationSlug(id, station.name(), townName(station.municipality())),
				link(province), town, nearby);
	}

	/** The addresses of every page, with the day of the data they show. Empty before the first import. */
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	Optional<Sitemap> sitemap() {
		Optional<Instant> publishedAt = this.dataVersion.publishedAt();
		if (publishedAt.isEmpty()) {
			return Optional.empty();
		}
		List<String> paths = new ArrayList<>(
				List.of("/", "/precio-gasolina-hoy", "/precio-diesel-hoy", "/estadisticas"));
		for (Province province : Province.ALL) {
			paths.add("/gasolineras/" + province.slug());
			towns(province.id()).keySet()
				.stream()
				.sorted()
				.forEach((town) -> paths.add("/gasolineras/" + province.slug() + "/" + town));
		}
		for (RankedStation station : this.repository.stationsSelling()) {
			paths.add("/gasolinera/" + stationSlug(station.id(), station.name(), townName(station.municipality())));
		}
		return Optional.of(new Sitemap(publishedAt.get().atZone(MADRID).toLocalDate(), paths));
	}

	/** Every address in the site's order, and the day of the prices they show. */
	record Sitemap(LocalDate lastModified, List<String> paths) {
	}

	/**
	 * {@code 4375-repsol-albacete}: the id finds the station, the rest only reads well. A page asked with another
	 * slug still opens and names this one as its canonical address.
	 */
	static String stationSlug(int id, String name, String town) {
		String brand = Slug.of(name, 30);
		String place = (town != null) ? Slug.of(town) : "";
		return String.join("-", Stream.of(String.valueOf(id), brand, place)
			.filter((part) -> !part.isEmpty())
			.toList());
	}

	private Map<String, Figures> figures(String provinceId, String area) {
		Map<String, FuelDay> latest = byFuel(this.repository.latestDay(area), FuelDay::fuel);
		Map<String, FuelDay> highest = byFuel(this.repository.highestDay(area), FuelDay::fuel);
		return this.repository.currentFigures(provinceId)
			.stream()
			.collect(Collectors.toMap(CurrentFigures::fuel,
					(row) -> new Figures(row.averagePrice(), row.minPrice(), row.maxPrice(), row.stations(),
							day(latest.get(row.fuel())), day(highest.get(row.fuel())))));
	}

	private List<StationRow> ranking(Fuel fuel, String provinceId) {
		return this.repository.cheapest(fuel, provinceId, RANKING_SIZE).stream().map((row) -> {
			Province province = province(row.provinceId());
			String town = townName(row.municipality());
			return new StationRow(row.id(), stationSlug(row.id(), row.name(), town), row.name(), town,
					(town != null) ? Slug.of(town) : null, province.name(), province.slug(), row.price());
		}).toList();
	}

	/**
	 * The towns of a province by slug. Register names that read the same (a different case, the article before or
	 * after) are one town with one page.
	 */
	private Map<String, Town> towns(String provinceId) {
		Map<String, Town> towns = new LinkedHashMap<>();
		for (TownCount row : this.repository.towns(provinceId)) {
			String name = PlaceName.display(row.name());
			towns.merge(Slug.of(name), new Town(name, Slug.of(name), List.of(row.name()), row.stations()),
					Town::merge);
		}
		return towns;
	}

	private Map<Integer, Map<String, BigDecimal>> prices(List<Integer> stationIds) {
		if (stationIds.isEmpty()) {
			return Map.of();
		}
		Map<Integer, Map<String, BigDecimal>> prices = new LinkedHashMap<>();
		for (StationPrice row : this.repository.prices(stationIds)) {
			prices.computeIfAbsent(row.stationId(), (id) -> new LinkedHashMap<>()).put(row.fuel(), row.price());
		}
		return prices;
	}

	private OffsetDateTime updatedAt() {
		return this.dataVersion.publishedAt()
			.orElseThrow(() -> new NoDataException("No current prices have been imported yet."))
			.atZone(MADRID)
			.toOffsetDateTime();
	}

	private static Province provinceBySlug(String slug) {
		return Province.bySlug(slug).orElseThrow(() -> new NoDataException("There is no province " + slug + "."));
	}

	private static Province province(String id) {
		return Province.byId(id).orElseThrow(() -> new IllegalStateException("Unknown province id " + id));
	}

	private static PlaceLink link(Province province) {
		return new PlaceLink(province.name(), province.slug());
	}

	private static PlaceLink townLink(String municipality) {
		String name = townName(municipality);
		return (name != null) ? new PlaceLink(name, Slug.of(name)) : null;
	}

	private static String townName(String municipality) {
		return (municipality != null) ? PlaceName.display(municipality) : null;
	}

	private static DayAverage day(FuelDay day) {
		return (day != null) ? new DayAverage(day.day(), day.averagePrice()) : null;
	}

	private static <T> Map<String, T> byFuel(List<T> rows, Function<T, String> fuel) {
		return rows.stream().collect(Collectors.toMap(fuel, Function.identity()));
	}

	/** A town page: its name, the register names it gathers and its stations selling now. */
	private record Town(String name, String slug, List<String> registerNames, int stations) {

		Town merge(Town other) {
			List<String> names = new ArrayList<>(this.registerNames);
			names.addAll(other.registerNames);
			// The spelling with more stations names the page.
			String name = (other.stations > this.stations) ? other.name : this.name;
			return new Town(name, this.slug, names, this.stations + other.stations);
		}

	}

}
