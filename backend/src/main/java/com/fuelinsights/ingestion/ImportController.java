package com.fuelinsights.ingestion;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import jakarta.validation.constraints.Past;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.format.annotation.DateTimeFormat.ISO;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Manual imports, for development only. The controller exists only with {@code fuel-insights.import.api-enabled};
 * production leaves it out, so the public API can only read, and the app imports by itself (catch-up).
 */
@RestController
@RequestMapping("/api/imports")
@ConditionalOnBooleanProperty("fuel-insights.import.api-enabled")
class ImportController {

	private static final long MAX_RANGE_DAYS = 731;

	private final DayImporter importer;

	private final ImportScheduler scheduler;

	private final ImportDayRepository importDays;

	ImportController(DayImporter importer, ImportScheduler scheduler, ImportDayRepository importDays) {
		this.importer = importer;
		this.scheduler = scheduler;
		this.importDays = importDays;
	}

	@PostMapping
	ImportDayView importDay(@RequestParam @DateTimeFormat(iso = ISO.DATE) @Past LocalDate date,
			@RequestParam(defaultValue = "false") boolean force) {
		return this.importer.importDay(date, force);
	}

	@PostMapping("/backfill")
	ResponseEntity<Map<String, LocalDate>> backfill(@RequestParam @DateTimeFormat(iso = ISO.DATE) @Past LocalDate from,
			@RequestParam @DateTimeFormat(iso = ISO.DATE) @Past LocalDate to) {
		checkRange(from, to);
		this.scheduler.startBackfill(from, to);
		return ResponseEntity.accepted().body(Map.of("from", from, "to", to));
	}

	@GetMapping
	List<ImportDayView> list(@RequestParam @DateTimeFormat(iso = ISO.DATE) LocalDate from,
			@RequestParam @DateTimeFormat(iso = ISO.DATE) LocalDate to) {
		checkRange(from, to);
		return this.importDays.list(from, to);
	}

	private static void checkRange(LocalDate from, LocalDate to) {
		if (from.isAfter(to) || ChronoUnit.DAYS.between(from, to) >= MAX_RANGE_DAYS) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"'from' must not be after 'to', and the range must be shorter than " + MAX_RANGE_DAYS + " days.");
		}
	}

}
