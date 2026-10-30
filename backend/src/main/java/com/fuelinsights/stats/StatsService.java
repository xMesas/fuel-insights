package com.fuelinsights.stats;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.fuelinsights.prices.Fuel;
import com.fuelinsights.prices.FuelView;
import com.fuelinsights.shared.NoDataException;
import com.fuelinsights.stats.StatsRepository.PublishedDay;

/** Picks the day or range to show and validates the request before running the SQL. */
@Service
class StatsService {

	private static final long DEFAULT_TREND_DAYS = 365;

	private static final long MAX_TREND_DAYS = 731;

	private final StatsRepository repository;

	StatsService(StatsRepository repository) {
		this.repository = repository;
	}

	// PostgreSQL's default (READ COMMITTED) takes a new snapshot per statement, so a publication committed between
	// the queries could mix two versions. REPEATABLE READ keeps one snapshot for the whole method.
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	ProvinceStatsResponse provinceStats(Fuel fuel, Optional<LocalDate> date) {
		PublishedDay day = publishedDay(date);
		return new ProvinceStatsResponse(FuelView.of(fuel), day.day(), day.publishedAt(),
				this.repository.national(day.day(), fuel), this.repository.byProvince(day.day(), fuel));
	}

	/** Without dates: the 365 days that end on the latest published day. */
	@Transactional(readOnly = true)
	TrendResponse trend(Fuel fuel, String areaId, Optional<LocalDate> from, Optional<LocalDate> to) {
		AreaView area = this.repository.findArea(areaId)
			.orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown area '" + areaId + "'."));
		LocalDate end = to.orElseGet(() -> publishedDay(Optional.empty()).day());
		LocalDate start = from.orElse(end.minusDays(DEFAULT_TREND_DAYS - 1));
		if (start.isAfter(end) || ChronoUnit.DAYS.between(start, end) >= MAX_TREND_DAYS) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"'from' must not be after 'to', and the range must be shorter than " + MAX_TREND_DAYS + " days.");
		}
		return new TrendResponse(FuelView.of(fuel), area, start, end,
				this.repository.trend(fuel, area.id(), start, end));
	}

	List<AreaView> areas() {
		return this.repository.areas();
	}

	private PublishedDay publishedDay(Optional<LocalDate> date) {
		return this.repository.findPublishedDay(date)
			.orElseThrow(() -> new NoDataException(date.map((d) -> "The day " + d + " has not been published.")
				.orElse("No day has been published yet.")));
	}

}
