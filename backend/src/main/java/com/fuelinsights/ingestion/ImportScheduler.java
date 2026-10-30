package com.fuelinsights.ingestion;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Imports many days, one after another: the catch-up (at startup and every morning) and the manual backfill. All of
 * them go through one worker thread, so two runs never compete for the import lock inside this process, and
 * shutdown can let the day in progress finish.
 */
@Service
class ImportScheduler {

	private static final Logger logger = LoggerFactory.getLogger(ImportScheduler.class);

	private static final Duration LOCK_RETRY = Duration.ofSeconds(1);

	private final DayImporter importer;

	private final ImportDayRepository importDays;

	private final ImportProperties properties;

	private final Clock clock;

	private final ExecutorService worker = Executors
		.newSingleThreadExecutor(Thread.ofVirtual().name("imports").factory());

	private final AtomicBoolean running = new AtomicBoolean();

	private volatile boolean stopping;

	ImportScheduler(DayImporter importer, ImportDayRepository importDays, ImportProperties properties, Clock clock) {
		this.importer = importer;
		this.importDays = importDays;
		this.properties = properties;
		this.clock = clock;
	}

	@EventListener(ApplicationReadyEvent.class)
	void catchUpOnStartup() {
		if (this.properties.catchUpOnStartup()) {
			startCatchUp();
		}
	}

	@Scheduled(cron = "${fuel-insights.import.cron}", zone = "Europe/Madrid")
	void dailyCatchUp() {
		if (!startCatchUp()) {
			logger.info("Daily catch-up skipped: another run is still importing");
		}
	}

	/** Starts a catch-up in the background; false if another run is already importing. */
	boolean startCatchUp() {
		return submit(() -> catchUp(LocalDate.now(this.clock)));
	}

	/** Starts a backfill in the background; only one run at a time. */
	void startBackfill(LocalDate from, LocalDate to) {
		boolean started = submit(() -> {
			List<LocalDate> missing = missingDays(from, to);
			logger.info("Backfill {}..{}: {} days to import", from, to, missing.size());
			importEach(missing);
		});
		if (!started) {
			throw new ImportBusyException("Another catch-up or backfill is already running.");
		}
	}

	/** Imports every day of the window ending yesterday that is not COMPLETED: gaps, failures and new days. */
	List<LocalDate> catchUp(LocalDate today) {
		List<LocalDate> missing = missingDays(today);
		logger.info("Catch-up of the last {} days: {} to import", this.properties.catchUpDays(), missing.size());
		importEach(missing);
		return missing;
	}

	/** The days of the catch-up window ending yesterday that are not COMPLETED, newest first. */
	List<LocalDate> missingDays(LocalDate today) {
		LocalDate to = today.minusDays(1);
		return missingDays(to.minusDays(this.properties.catchUpDays() - 1L), to);
	}

	@PreDestroy
	void stop() throws InterruptedException {
		this.stopping = true;
		this.worker.shutdown();
		if (!this.worker.awaitTermination(this.properties.shutdownWait().toMillis(), TimeUnit.MILLISECONDS)) {
			logger.warn("The import in progress did not finish in {}: interrupting it", this.properties.shutdownWait());
			this.worker.shutdownNow();
		}
	}

	private boolean submit(Runnable run) {
		if (this.stopping || !this.running.compareAndSet(false, true)) {
			return false;
		}
		try {
			this.worker.execute(() -> {
				try {
					run.run();
				}
				finally {
					this.running.set(false);
				}
			});
			return true;
		}
		catch (RejectedExecutionException ex) {
			this.running.set(false);
			return false;
		}
	}

	// Newest first, so the web is useful sooner. Order does not matter for correctness: an older day never
	// overwrites newer station details.
	private List<LocalDate> missingDays(LocalDate from, LocalDate to) {
		Set<LocalDate> completed = this.importDays.completedDays(from, to);
		return from.datesUntil(to.plusDays(1))
			.filter((day) -> !completed.contains(day))
			.sorted(Comparator.reverseOrder())
			.toList();
	}

	// A failed day is logged and skipped: it stays FAILED with its error, and the next catch-up tries it again.
	private void importEach(List<LocalDate> days) {
		for (int i = 0; i < days.size(); i++) {
			if (this.stopping) {
				logger.info("Shutting down: {} days left for the next run", days.size() - i);
				return;
			}
			LocalDate day = days.get(i);
			try {
				importWhenFree(day);
			}
			catch (ImportBusyException ex) {
				logger.info("Import of {} skipped: another import held the lock for {}", day,
						this.properties.lockWait());
			}
			catch (RuntimeException ex) {
				logger.warn("Import of {} failed: {}", day, ex.getMessage());
			}
			if (!pause(this.properties.pause())) {
				return;
			}
		}
	}

	// While another import (an API call or another instance) holds the lock, try the same day again. A day that
	// never gets the lock is not FAILED: it is simply still missing, and the next run imports it. Every attempt
	// checks for shutdown first, so a day never starts after stop() has begun.
	private void importWhenFree(LocalDate day) {
		long deadline = System.nanoTime() + this.properties.lockWait().toNanos();
		while (!this.stopping) {
			try {
				this.importer.importDay(day, false);
				return;
			}
			catch (ImportBusyException ex) {
				if (System.nanoTime() - deadline >= 0 || !pause(LOCK_RETRY)) {
					throw ex;
				}
			}
		}
	}

	private static boolean pause(Duration duration) {
		try {
			Thread.sleep(duration);
			return true;
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			return false;
		}
	}

}
