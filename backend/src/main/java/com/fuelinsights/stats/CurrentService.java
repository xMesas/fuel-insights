package com.fuelinsights.stats;

import java.text.Collator;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.fuelinsights.prices.DataVersion;
import com.fuelinsights.prices.Fuel;
import com.fuelinsights.prices.FuelView;
import com.fuelinsights.shared.NoDataException;
import com.fuelinsights.shared.PlaceName;
import com.fuelinsights.stations.OpeningHours;
import com.fuelinsights.stats.CurrentRepository.FuelDay;
import com.fuelinsights.stats.CurrentRepository.FuelFigures;
import com.fuelinsights.stats.CurrentRepository.FuelHistoryRow;
import com.fuelinsights.stats.CurrentRepository.FuelProvince;
import com.fuelinsights.stats.CurrentRepository.StationDetails;
import com.fuelinsights.stats.CurrentStatsResponse.CurrentFuel;
import com.fuelinsights.stats.StationResponse.FuelHistory;
import com.fuelinsights.stats.StationResponse.StationPrice;
import com.fuelinsights.stats.ZoneStatsResponse.ZoneFuel;

/**
 * The current prices for the web. Every method runs its queries in one REPEATABLE READ snapshot, so an import that
 * replaces the prices in the middle cannot mix two lists.
 */
@Service
class CurrentService {

	// The Ministry publishes Madrid times; the API keeps that offset so the web shows the same clock.
	private static final ZoneId MADRID = ZoneId.of("Europe/Madrid");

	// The map's list shows 10; the limit only keeps one request from asking for the whole catalog.
	private static final int MAX_SUMMARIES = 50;

	private final CurrentRepository repository;

	private final DataVersion dataVersion;

	CurrentService(CurrentRepository repository, DataVersion dataVersion) {
		this.repository = repository;
		this.dataVersion = dataVersion;
	}

	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	CurrentStatsResponse current() {
		OffsetDateTime updatedAt = updatedAt();
		Map<String, FuelFigures> figures = byFuel(this.repository.fuelFigures(), FuelFigures::fuel);
		Map<String, FuelDay> latestDay = byFuel(this.repository.latestDay(), FuelDay::fuel);
		Map<String, FuelDay> highestDay = byFuel(this.repository.highestDay(), FuelDay::fuel);
		Map<String, List<FuelProvince>> provinces = this.repository.provinces()
			.stream()
			.collect(Collectors.groupingBy(FuelProvince::fuel));
		List<CurrentFuel> fuels = Arrays.stream(Fuel.values()).map((fuel) -> {
			FuelFigures current = figures.get(fuel.name());
			return new CurrentFuel(FuelView.of(fuel), (current != null) ? current.averagePrice() : null,
					(current != null) ? current.medianPrice() : null, (current != null) ? current.minPrice() : null,
					(current != null) ? current.maxPrice() : null, (current != null) ? current.stations() : 0,
					view(latestDay.get(fuel.name())), view(highestDay.get(fuel.name())),
					provinces.getOrDefault(fuel.name(), List.of()).stream().map(FuelProvince::toView).toList());
		}).toList();
		return new CurrentStatsResponse(updatedAt, fuels);
	}

	/**
	 * The board for one zone. The change in a week compares the zone with itself: today's current prices against
	 * the same zone's daily prices seven days before the Ministry's current list.
	 */
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	ZoneStatsResponse zone(Zone zone) {
		OffsetDateTime updatedAt = updatedAt();
		LocalDate weekAgo = updatedAt.toLocalDate().minusDays(7);
		Map<String, FuelDay> before = byFuel(this.repository.zoneAverages(weekAgo, zone), FuelDay::fuel);
		List<ZoneFuel> fuels = this.repository.zoneFigures(zone)
			.stream()
			.sorted(Comparator.comparing((row) -> Fuel.valueOf(row.fuel())))
			.map((row) -> new ZoneFuel(FuelView.of(Fuel.valueOf(row.fuel())), row.minPrice(), row.averagePrice(),
					row.stations(),
					(before.get(row.fuel()) != null) ? before.get(row.fuel()).averagePrice() : null))
			.toList();
		return new ZoneStatsResponse(updatedAt, before.isEmpty() ? null : weekAgo, fuels);
	}

	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	StationsResponse stations(Fuel fuel) {
		return new StationsResponse(FuelView.of(fuel), updatedAt(), this.repository.mapStations(fuel));
	}

	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	StationResponse station(int id) {
		StationDetails details = this.repository.station(id)
			.orElseThrow(() -> new NoDataException("The station " + id + " is not known."));
		OffsetDateTime updatedAt = updatedAt();
		List<StationPrice> prices = this.repository.currentPrices(id)
			.stream()
			.sorted(Comparator.comparing((price) -> Fuel.valueOf(price.fuel())))
			.map((price) -> new StationPrice(FuelView.of(Fuel.valueOf(price.fuel())), price.price()))
			.toList();
		List<FuelHistory> history = this.repository.history(id)
			.stream()
			.collect(Collectors.groupingBy(FuelHistoryRow::fuel))
			.entrySet()
			.stream()
			.sorted(Comparator.comparing((entry) -> Fuel.valueOf(entry.getKey())))
			.map((entry) -> new FuelHistory(entry.getKey(),
					entry.getValue().stream().map(FuelHistoryRow::toPoint).toList()))
			.toList();
		return new StationResponse(details.id(), details.name(), details.address(),
				displayName(details.municipality()), details.provinceId(), details.province(), details.postalCode(),
				details.latitude(), details.longitude(), details.schedule(), openingHours(details.schedule()),
				updatedAt, prices, history);
	}

	@Transactional(readOnly = true)
	List<MunicipalityPrice> municipalities(Fuel fuel) {
		return this.repository.municipalities(fuel)
			.stream()
			.map((row) -> new MunicipalityPrice(displayName(row.name()), row.provinceId(), row.averagePrice(),
					row.stations()))
			.toList();
	}

	/** Sorted as a Spanish reader expects: accents do not move a name to the end. */
	@Transactional(readOnly = true)
	List<Place> places() {
		Collator spanish = Collator.getInstance(Locale.forLanguageTag("es"));
		return this.repository.places()
			.stream()
			.map((place) -> new Place(displayName(place.name()), place.provinceId(), place.latitude(),
					place.longitude(), place.stations()))
			.sorted(Comparator.comparing(Place::name, spanish))
			.toList();
	}

	/** Unknown ids are left out. */
	@Transactional(readOnly = true)
	List<StationSummary> summaries(List<Integer> ids) {
		if (ids.isEmpty()) {
			return List.of();
		}
		if (ids.size() > MAX_SUMMARIES) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Ask for at most " + MAX_SUMMARIES + " stations at a time.");
		}
		return this.repository.summaries(ids)
			.stream()
			.map((row) -> new StationSummary(row.id(), row.name(), displayName(row.municipality()),
					openingHours(row.schedule())))
			.toList();
	}

	private static List<List<List<String>>> openingHours(String schedule) {
		return OpeningHours.parse(schedule).orElse(null);
	}

	// The same town must read the same in the search box, the lists and the card.
	private static String displayName(String municipality) {
		return (municipality != null) ? PlaceName.display(municipality) : null;
	}

	private OffsetDateTime updatedAt() {
		Instant publishedAt = this.dataVersion.publishedAt()
			.orElseThrow(() -> new NoDataException("No current prices have been imported yet."));
		return publishedAt.atZone(MADRID).toOffsetDateTime();
	}

	private static <T> Map<String, T> byFuel(List<T> rows, Function<T, String> fuel) {
		return rows.stream().collect(Collectors.toMap(fuel, Function.identity()));
	}

	private static CurrentStatsResponse.DailyAverage view(FuelDay day) {
		return (day != null) ? day.toView() : null;
	}

}
