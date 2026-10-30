package com.fuelinsights.charging;

import java.time.Clock;
import java.time.Duration;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;

import org.springframework.stereotype.Component;

/** Whether the charging sites are fresh: the feed is published daily, so its age should stay under a day or so. */
@Component
class ChargingMetrics implements MeterBinder {

	private final ChargingRepository repository;

	private final Clock clock;

	ChargingMetrics(ChargingRepository repository, Clock clock) {
		this.repository = repository;
		this.clock = clock;
	}

	@Override
	public void bindTo(MeterRegistry registry) {
		Gauge.builder("fuel_insights.charging.age", this, ChargingMetrics::age)
			.description("Hours since the feed time of the charging sites; normally under 30, NaN without data")
			.baseUnit("hours")
			.register(registry);
	}

	double age() {
		return this.repository.publishedAt()
			.map((publishedAt) -> (double) Duration.between(publishedAt, this.clock.instant()).toHours())
			.orElse(Double.NaN);
	}

}
