package com.fuelinsights.ingestion;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.fuelinsights.prices.CurrentPrice;
import com.fuelinsights.prices.CurrentPriceRepository;
import com.fuelinsights.prices.CurrentPricesUpdated;
import com.fuelinsights.stations.Station;
import com.fuelinsights.stations.StationRepository;

/**
 * Keeps the prices in force now. The Ministry refreshes its list every half hour; a list we already have is not
 * written again, and a new one replaces the old one in a single transaction.
 */
@Service
class CurrentPriceImporter {

	enum Outcome {

		UPDATED, UNCHANGED, BUSY

	}

	private static final Logger logger = LoggerFactory.getLogger(CurrentPriceImporter.class);

	// Not the day import's key: the two imports write different tables and may run at the same time.
	static final long LOCK_KEY = ImportLock.LOCK_KEY + 1;

	private static final ZoneId MADRID = ZoneId.of("Europe/Madrid");

	private final MinistryClient ministry;

	private final BrandNormalizer brands;

	private final StationRepository stations;

	private final CurrentPriceRepository currentPrices;

	private final TransactionTemplate transaction;

	private final JdbcClient jdbc;

	private final TaskScheduler taskScheduler;

	private final Clock clock;

	private final boolean refreshOnStartup;

	private final ApplicationEventPublisher events;

	CurrentPriceImporter(MinistryClient ministry, BrandNormalizer brands, StationRepository stations,
			CurrentPriceRepository currentPrices, TransactionTemplate transaction, JdbcClient jdbc,
			TaskScheduler taskScheduler, Clock clock,
			@Value("${fuel-insights.current.refresh-on-startup}") boolean refreshOnStartup,
			ApplicationEventPublisher events) {
		this.ministry = ministry;
		this.brands = brands;
		this.stations = stations;
		this.currentPrices = currentPrices;
		this.transaction = transaction;
		this.jdbc = jdbc;
		this.taskScheduler = taskScheduler;
		this.clock = clock;
		this.refreshOnStartup = refreshOnStartup;
		this.events = events;
	}

	// In the background, so the app is ready (and the web served) while the 12 MB list downloads.
	@EventListener(ApplicationReadyEvent.class)
	void refreshAfterStartup() {
		if (this.refreshOnStartup) {
			this.taskScheduler.schedule(this::scheduledRefresh, Instant.now(this.clock));
		}
	}

	@Scheduled(cron = "${fuel-insights.current.cron}", zone = "Europe/Madrid")
	void scheduledRefresh() {
		try {
			refresh();
		}
		catch (RuntimeException ex) {
			logger.warn("Current prices not refreshed: {}", ex.getMessage());
		}
	}

	Outcome refresh() {
		MinistryCurrentResponse response = this.ministry.fetchCurrent();
		Instant publishedAt = response.publishedAt();
		if (this.currentPrices.publishedAt().filter(publishedAt::equals).isPresent()) {
			logger.debug("Current prices of {} already imported", publishedAt);
			return Outcome.UNCHANGED;
		}
		Snapshot snapshot = translate(response.stations());
		LocalDate day = LocalDate.ofInstant(publishedAt, MADRID);
		Outcome outcome = Objects.requireNonNull(this.transaction.execute((status) -> {
			if (!tryLock()) {
				return Outcome.BUSY;
			}
			// Checked again under the lock: another instance may have stored a newer list while this one was
			// downloading, and the lock orders the writes but not the downloads.
			if (this.currentPrices.publishedAt().filter((stored) -> !publishedAt.isAfter(stored)).isPresent()) {
				return Outcome.UNCHANGED;
			}
			this.stations.insertMissing(day, snapshot.catalog());
			this.currentPrices.replace(publishedAt, Instant.now(this.clock), snapshot.prices(), snapshot.schedules());
			return Outcome.UPDATED;
		}));
		switch (outcome) {
			case UPDATED -> logger.info("Current prices of {} imported: {} stations, {} prices", publishedAt,
					snapshot.catalog().size(), snapshot.prices().size());
			case UNCHANGED -> logger.info("Current prices of {} skipped: a list as recent is already stored", publishedAt);
			case BUSY -> logger.info("Current prices skipped: another instance is importing them");
		}
		// After the commit: a listener must see the new prices, and its failure must not undo them.
		if (outcome == Outcome.UPDATED) {
			this.events.publishEvent(new CurrentPricesUpdated(publishedAt));
		}
		return outcome;
	}

	// Released when the transaction ends, so a crash can never leave it held.
	private boolean tryLock() {
		return Boolean.TRUE.equals(this.jdbc.sql("select pg_try_advisory_xact_lock(:key)")
			.param("key", LOCK_KEY)
			.query(Boolean.class)
			.single());
	}

	// A station that cannot be read is left out, as in the daily import.
	private Snapshot translate(List<MinistryStation> rawStations) {
		Map<Integer, Station> catalog = new LinkedHashMap<>();
		List<CurrentPrice> prices = new ArrayList<>();
		Map<Integer, String> schedules = new LinkedHashMap<>();
		for (MinistryStation raw : rawStations) {
			read(raw).ifPresent((row) -> {
				catalog.put(row.station().id(), row.station());
				schedules.put(row.station().id(), raw.trimmedSchedule());
				prices.addAll(row.prices());
			});
		}
		return new Snapshot(List.copyOf(catalog.values()), prices, schedules);
	}

	private Optional<Row> read(MinistryStation raw) {
		try {
			Station station = raw.toStation();
			List<CurrentPrice> prices = raw.prices()
				.stream()
				.map((price) -> new CurrentPrice(price.stationId(), price.fuel(), price.price()))
				.toList();
			return Optional.of(new Row(station.withBrand(this.brands.normalize(station.brandRaw())), prices));
		}
		catch (RuntimeException ex) {
			logger.warn("Skipping station {} in the current prices: {}", Objects.toString(raw.id()), ex.getMessage());
			return Optional.empty();
		}
	}

	private record Row(Station station, List<CurrentPrice> prices) {
	}

	private record Snapshot(List<Station> catalog, List<CurrentPrice> prices, Map<Integer, String> schedules) {
	}

}
