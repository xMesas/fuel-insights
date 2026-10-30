package com.fuelinsights.ingestion;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/** The single import worker: one run at a time, busy locks and shutdown. The importer is a mock. */
class ImportSchedulerTest {

	private static final Clock TODAY = Clock.fixed(Instant.parse("2026-10-28T10:00:00Z"), ZoneId.of("Europe/Madrid"));

	private static final LocalDate YESTERDAY = LocalDate.of(2026, 10, 27);

	private final DayImporter importer = mock();

	private final ImportDayRepository importDays = mock();

	private final CountDownLatch importing = new CountDownLatch(1);

	private final CountDownLatch release = new CountDownLatch(1);

	private ImportScheduler scheduler;

	@AfterEach
	void stopWorker() throws InterruptedException {
		this.release.countDown();
		this.scheduler.stop();
	}

	@Test
	void catchUpIsSkippedWhileAnotherRunIsImporting() throws Exception {
		startBlockedRun();

		assertThat(this.scheduler.startCatchUp()).isFalse();
	}

	@Test
	void backfillWhileAnotherRunIsImportingIsAConflict() throws Exception {
		startBlockedRun();

		assertThatExceptionOfType(ImportBusyException.class)
			.isThrownBy(() -> this.scheduler.startBackfill(YESTERDAY.minusDays(5), YESTERDAY));
	}

	@Test
	void noNewDayStartsOnceShutdownHasBegun() throws Exception {
		startBlockedRun();

		Thread stopper = Thread.ofPlatform().start(this::stopQuietly);
		// stop() has flagged the shutdown once it waits for the worker.
		while (stopper.getState() != Thread.State.TIMED_WAITING) {
			Thread.onSpinWait();
		}
		this.release.countDown();
		stopper.join(5_000);

		verify(this.importer, times(1)).importDay(any(), anyBoolean());
	}

	@Test
	void dayWaitingForTheLockDoesNotStartOnceShutdownHasBegun() throws Exception {
		this.scheduler = scheduler(false, 1, Duration.ofSeconds(10));
		given(this.importDays.completedDays(any(), any())).willReturn(Set.of());
		// The lock is busy on the first attempt and free afterwards; stop() arrives during the 1 s wait between.
		given(this.importer.importDay(YESTERDAY, false)).willAnswer((invocation) -> {
			this.importing.countDown();
			throw new ImportBusyException();
		}).willReturn(null);
		assertThat(this.scheduler.startCatchUp()).isTrue();
		assertThat(this.importing.await(5, TimeUnit.SECONDS)).isTrue();

		this.scheduler.stop();

		verify(this.importer, times(1)).importDay(any(), anyBoolean());
	}

	@Test
	void dayWhoseLockIsBusyIsTriedAgainUntilItIsFree() {
		this.scheduler = scheduler(false, 1, Duration.ofSeconds(10));
		given(this.importDays.completedDays(any(), any())).willReturn(Set.of());
		given(this.importer.importDay(YESTERDAY, false)).willThrow(new ImportBusyException())
			.willThrow(new ImportBusyException())
			.willReturn(null);

		this.scheduler.catchUp(LocalDate.now(TODAY));

		verify(this.importer, times(3)).importDay(YESTERDAY, false);
	}

	@Test
	void startupCatchUpRunsWhenEnabled() {
		this.scheduler = scheduler(true, 1, Duration.ZERO);
		given(this.importDays.completedDays(any(), any())).willReturn(Set.of());

		this.scheduler.catchUpOnStartup();

		verify(this.importer, timeout(5_000)).importDay(YESTERDAY, false);
	}

	@Test
	void startupCatchUpDoesNothingWhenDisabled() throws InterruptedException {
		this.scheduler = scheduler(false, 1, Duration.ZERO);

		this.scheduler.catchUpOnStartup();
		this.scheduler.stop();

		verifyNoInteractions(this.importer, this.importDays);
	}

	// A catch-up of three days whose first import (yesterday, the newest) waits until the test releases it.
	private void startBlockedRun() throws InterruptedException {
		this.scheduler = scheduler(false, 3, Duration.ZERO);
		given(this.importDays.completedDays(any(), any())).willReturn(Set.of());
		given(this.importer.importDay(any(), anyBoolean())).willAnswer((invocation) -> {
			this.importing.countDown();
			this.release.await(5, TimeUnit.SECONDS);
			return null;
		});
		assertThat(this.scheduler.startCatchUp()).isTrue();
		assertThat(this.importing.await(5, TimeUnit.SECONDS)).isTrue();
	}

	private ImportScheduler scheduler(boolean catchUpOnStartup, int catchUpDays, Duration lockWait) {
		ImportProperties properties = new ImportProperties(catchUpDays, catchUpOnStartup, Duration.ZERO, lockWait,
				Duration.ofSeconds(5));
		return new ImportScheduler(this.importer, this.importDays, properties, TODAY);
	}

	private void stopQuietly() {
		try {
			this.scheduler.stop();
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
		}
	}

}
