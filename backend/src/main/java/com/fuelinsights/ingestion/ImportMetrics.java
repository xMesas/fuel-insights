package com.fuelinsights.ingestion;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;

import org.springframework.stereotype.Component;

import com.fuelinsights.prices.CurrentPriceRepository;

/**
 * Whether the data is up to date, as metrics for alarms. They are not part of the health check: restarting the app
 * does not make the Ministry publish, and an empty database would never let the first start become healthy.
 */
@Component
class ImportMetrics implements MeterBinder {

	private final ImportDayRepository importDays;

	private final ImportScheduler scheduler;

	private final CurrentPriceRepository currentPrices;

	private final Clock clock;

	ImportMetrics(ImportDayRepository importDays, ImportScheduler scheduler, CurrentPriceRepository currentPrices,
			Clock clock) {
		this.importDays = importDays;
		this.scheduler = scheduler;
		this.currentPrices = currentPrices;
		this.clock = clock;
	}

	@Override
	public void bindTo(MeterRegistry registry) {
		Gauge.builder("fuel_insights.data.age", this, ImportMetrics::dataAge)
			.description("Days from the latest published day to today in Madrid; normally 1, NaN without data")
			.baseUnit("days")
			.register(registry);
		Gauge.builder("fuel_insights.data.missing_days", this, ImportMetrics::missingDays)
			.description("Days of the catch-up window that are not completed")
			.baseUnit("days")
			.register(registry);
		Gauge.builder("fuel_insights.current.age", this, ImportMetrics::currentAge)
			.description("Minutes since the Ministry time of the current prices; normally under 45, NaN without data")
			.baseUnit("minutes")
			.register(registry);
	}

	double currentAge() {
		return this.currentPrices.publishedAt()
			.map((publishedAt) -> (double) Duration.between(publishedAt, this.clock.instant()).toMinutes())
			.orElse(Double.NaN);
	}

	double dataAge() {
		return this.importDays.latestPublishedDay()
			.map((day) -> (double) ChronoUnit.DAYS.between(day, LocalDate.now(this.clock)))
			.orElse(Double.NaN);
	}

	double missingDays() {
		return this.scheduler.missingDays(LocalDate.now(this.clock)).size();
	}

}
