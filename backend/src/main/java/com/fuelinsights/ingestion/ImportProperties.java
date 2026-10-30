package com.fuelinsights.ingestion;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The window of days the app keeps complete, how imports run one after another and how long shutdown waits for
 * the day in progress. The cron is read by @Scheduled and {@code api-enabled} by the controller's condition.
 */
@ConfigurationProperties("fuel-insights.import")
public record ImportProperties(int catchUpDays, boolean catchUpOnStartup, Duration pause, Duration lockWait,
		Duration shutdownWait) {
}
