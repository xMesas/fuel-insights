package com.fuelinsights.charging;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.fuelinsights.charging.ChargingFeedParser.ChargingFeed;

/**
 * Keeps the public charging sites. The feed changes once a day, so a run that finds the same feed time writes
 * nothing, and a new feed replaces the old sites in one transaction, as the current fuel prices do.
 */
@Service
class ChargingImporter {

	enum Outcome {

		UPDATED, UNCHANGED, BUSY

	}

	private static final Logger logger = LoggerFactory.getLogger(ChargingImporter.class);

	// Next to the fuel imports' keys (4_861_731 and 4_861_732): this import writes its own tables, so it never
	// waits for them.
	static final long LOCK_KEY = 4_861_733L;

	private final ChargingFeedClient feed;

	private final ChargingRepository repository;

	private final TransactionTemplate transaction;

	private final JdbcClient jdbc;

	private final TaskScheduler taskScheduler;

	private final Clock clock;

	private final boolean refreshOnStartup;

	ChargingImporter(ChargingFeedClient feed, ChargingRepository repository, TransactionTemplate transaction,
			JdbcClient jdbc, TaskScheduler taskScheduler, Clock clock,
			@Value("${fuel-insights.charging.refresh-on-startup}") boolean refreshOnStartup) {
		this.feed = feed;
		this.repository = repository;
		this.transaction = transaction;
		this.jdbc = jdbc;
		this.taskScheduler = taskScheduler;
		this.clock = clock;
		this.refreshOnStartup = refreshOnStartup;
	}

	@EventListener(ApplicationReadyEvent.class)
	void refreshAfterStartup() {
		if (this.refreshOnStartup) {
			this.taskScheduler.schedule(this::scheduledRefresh, Instant.now(this.clock));
		}
	}

	@Scheduled(cron = "${fuel-insights.charging.cron}", zone = "Europe/Madrid")
	void scheduledRefresh() {
		try {
			refresh();
		}
		catch (RuntimeException ex) {
			logger.warn("Charging sites not refreshed: {}", ex.getMessage());
		}
	}

	Outcome refresh() {
		ChargingFeed feed = this.feed.fetch();
		Instant publishedAt = feed.publishedAt();
		Outcome outcome = Objects.requireNonNull(this.transaction.execute((status) -> {
			if (!tryLock()) {
				return Outcome.BUSY;
			}
			// Under the lock, so two instances that downloaded the feed at the same time write it once.
			if (this.repository.publishedAt().filter((stored) -> !publishedAt.isAfter(stored)).isPresent()) {
				return Outcome.UNCHANGED;
			}
			this.repository.replace(publishedAt, Instant.now(this.clock), feed.sites());
			return Outcome.UPDATED;
		}));
		switch (outcome) {
			case UPDATED -> logger.info("Charging sites of {} imported: {} sites", publishedAt, feed.sites().size());
			case UNCHANGED -> logger.debug("Charging sites of {} already imported", publishedAt);
			case BUSY -> logger.info("Charging sites skipped: another instance is importing them");
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

}
