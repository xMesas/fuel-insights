package com.fuelinsights.prices;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * The version of the price data every read API answers from: the Ministry's current list and the imported days. It is
 * the ETag of the cached answers, so it must change whenever either of them changes.
 */
@Component
public class DataVersion {

	private final JdbcClient jdbc;

	DataVersion(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** When the Ministry published the current list; empty before the first import. */
	public Optional<Instant> publishedAt() {
		return this.jdbc.sql("select published_at from current_snapshot")
			.query((rs, rowNum) -> rs.getObject(1, OffsetDateTime.class).toInstant())
			.optional();
	}

	/**
	 * Changes when the Ministry publishes a new current list or any imported day changes (a new day, a re-import, a
	 * backfill of an old day). Empty before the first list.
	 */
	public Optional<String> current() {
		return publishedAt().map((publishedAt) -> publishedAt.getEpochSecond() + "." + importRevision());
	}

	/**
	 * Changes whenever a day starts, finishes, fails or is published (each step stamps one of its times) and when a
	 * day is added or removed: the history the answers read cannot change without it.
	 */
	private String importRevision() {
		return this.jdbc.sql("""
				select count(*) || '-' || coalesce(
					floor(extract(epoch from max(greatest(started_at, finished_at, published_at))) * 1000000)::bigint::text,
					'0')
				from import_day
				""")
			.query(String.class)
			.single();
	}

}
