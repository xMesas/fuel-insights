package com.fuelinsights.stats;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import com.fuelinsights.prices.DataVersion;
import com.fuelinsights.prices.Fuel;
import com.fuelinsights.prices.FuelView;
import com.fuelinsights.shared.NoDataException;
import com.fuelinsights.stats.InsightsRepository.SpreadRow;
import com.fuelinsights.stats.InsightsResponses.BrandsResponse;
import com.fuelinsights.stats.InsightsResponses.BrandsResponse.Brand;
import com.fuelinsights.stats.InsightsResponses.SpreadResponse;
import com.fuelinsights.stats.InsightsResponses.SpreadResponse.Spread;
import com.fuelinsights.stats.InsightsResponses.WeekdayResponse;
import com.fuelinsights.stats.InsightsResponses.WeekdayResponse.Weekday;

/** The statistics tab: the cheapest weekday, what choosing a station saves, and the brands. */
@Service
class InsightsService {

	private static final ZoneId MADRID = ZoneId.of("Europe/Madrid");

	// A year: every weekday then has about 50 weeks behind its average.
	private static final int WEEKDAY_DAYS = 365;

	// Smaller brands would rank on a handful of stations in one town.
	private static final int MIN_BRAND_STATIONS = 50;

	// Brand codes whose plain capitalisation is wrong; the rest read as "Repsol", "Ballenoil".
	private static final Map<String, String> BRAND_NAMES = Map.of("BP", "BP", "Q8", "Q8", "BONAREA", "bonÀrea",
			"INDEPENDENT", "Sin marca", "GASEXPRESS", "GasExpress");

	private final InsightsRepository repository;

	private final CurrentRepository current;

	private final DataVersion dataVersion;

	InsightsService(InsightsRepository repository, CurrentRepository current, DataVersion dataVersion) {
		this.repository = repository;
		this.current = current;
		this.dataVersion = dataVersion;
	}

	@Transactional(readOnly = true)
	WeekdayResponse weekdays(Fuel fuel) {
		var rows = this.repository.weekdays(fuel, WEEKDAY_DAYS);
		if (rows.isEmpty()) {
			throw new NoDataException("There are not enough published days of " + fuel.displayName() + " yet.");
		}
		return new WeekdayResponse(FuelView.of(fuel),
				rows.stream().map(InsightsRepository.WeekdayRow::firstDay).min(Comparator.naturalOrder()).orElseThrow(),
				rows.stream().map(InsightsRepository.WeekdayRow::lastDay).max(Comparator.naturalOrder()).orElseThrow(),
				rows.stream().map((row) -> new Weekday(row.weekday(), row.deviation(), row.days())).toList());
	}

	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	SpreadResponse spread(Fuel fuel) {
		OffsetDateTime updatedAt = updatedAt();
		List<SpreadRow> rows = this.repository.spread(fuel);
		Spread spain = rows.stream()
			.filter((row) -> "ES".equals(row.area()))
			.map(InsightsService::spread)
			.findFirst()
			.orElseThrow(() -> new NoDataException("No station sells " + fuel.displayName() + " now."));
		List<Spread> provinces = rows.stream()
			.filter((row) -> !"ES".equals(row.area()))
			.map(InsightsService::spread)
			.sorted(Comparator.comparing((Spread row) -> row.dearPrice().subtract(row.cheapPrice()))
				.reversed()
				.thenComparing(Spread::provinceId))
			.toList();
		return new SpreadResponse(updatedAt, FuelView.of(fuel), spain, provinces);
	}

	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	BrandsResponse brands(Fuel fuel) {
		OffsetDateTime updatedAt = updatedAt();
		BigDecimal national = this.current.fuelFigures()
			.stream()
			.filter((row) -> row.fuel().equals(fuel.name()))
			.map(CurrentRepository.FuelFigures::averagePrice)
			.findFirst()
			.orElseThrow(() -> new NoDataException("No station sells " + fuel.displayName() + " now."));
		List<Brand> brands = this.repository.brands(fuel, MIN_BRAND_STATIONS)
			.stream()
			.map((row) -> new Brand(row.brand(), brandName(row.brand()), row.averagePrice(), row.minPrice(),
					row.stations()))
			.toList();
		return new BrandsResponse(updatedAt, FuelView.of(fuel), national, brands);
	}

	static String brandName(String code) {
		String known = BRAND_NAMES.get(code);
		if (known != null) {
			return known;
		}
		String lower = code.toLowerCase(Locale.ROOT);
		return Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
	}

	private static Spread spread(SpreadRow row) {
		return new Spread("ES".equals(row.area()) ? null : row.area(), row.cheapPrice(), row.medianPrice(),
				row.dearPrice(), row.minPrice(), row.maxPrice(), row.stations());
	}

	private OffsetDateTime updatedAt() {
		return this.dataVersion.publishedAt()
			.orElseThrow(() -> new NoDataException("No current prices have been imported yet."))
			.atZone(MADRID)
			.toOffsetDateTime();
	}

}
