package com.fuelinsights.ingestion;

import java.time.Instant;
import java.time.LocalDate;

/** The import state of one day; {@code publishedAt} is when the web last got its numbers. */
public record ImportDayView(LocalDate day, String status, Integer stations, Integer prices, Instant startedAt,
		Instant finishedAt, Instant publishedAt, String error) {
}
