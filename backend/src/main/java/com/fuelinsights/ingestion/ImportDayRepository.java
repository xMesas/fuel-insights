package com.fuelinsights.ingestion;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** The lifecycle of each day's import: RUNNING, then COMPLETED (published) or FAILED. */
@Repository
class ImportDayRepository {

	private static final String SELECT = """
			select day, status, stations, prices, started_at, finished_at, published_at, error from import_day
			""";

	private final JdbcClient jdbc;

	ImportDayRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	// published_at is left alone: while a day is re-imported, its last published numbers stay visible.
	// The execution becomes the owner of the day (the fencing token every later write checks).
	void markRunning(LocalDate day, long execution) {
		this.jdbc.sql("""
				insert into import_day (day, status, started_at, owner_execution) values (:day, 'RUNNING', now(), :execution)
				on conflict (day) do update set status = 'RUNNING', started_at = now(), finished_at = null, error = null,
					owner_execution = excluded.owner_execution
				""").param("day", day).param("execution", execution).update();
	}

	/**
	 * Locks the day's row until the end of the current transaction and fails if another execution owns the day. A
	 * newer import changes the owner under the same row lock, so a write that passed this check cannot interleave
	 * with the takeover.
	 */
	void checkOwner(LocalDate day, long execution) {
		Long owner = this.jdbc.sql("select owner_execution from import_day where day = :day for update")
			.param("day", day)
			.query(Long.class)
			.optional()
			.orElse(null);
		if (owner == null || owner != execution) {
			throw new ImportOwnershipLostException(day, execution, owner);
		}
	}

	void markPublished(LocalDate day) {
		this.jdbc.sql("""
				update import_day set status = 'COMPLETED', error = null, finished_at = now(), published_at = now(),
					stations = (select count(distinct station_id) from price_daily where day = :day),
					prices = (select count(*) from price_daily where day = :day)
				where day = :day
				""").param("day", day).update();
	}

	// Only the owner may mark the day as failed: an old execution must not overwrite a newer one's status.
	void markFailed(LocalDate day, long execution, String error) {
		this.jdbc.sql("""
				insert into import_day (day, status, finished_at, error, owner_execution)
				values (:day, 'FAILED', now(), :error, :execution)
				on conflict (day) do update set status = 'FAILED', finished_at = now(), error = excluded.error
				where import_day.owner_execution is null or import_day.owner_execution = excluded.owner_execution
				""").param("day", day).param("error", truncate(error)).param("execution", execution).update();
	}

	boolean isCompleted(LocalDate day) {
		return this.jdbc.sql("select count(*) from import_day where day = :day and status = 'COMPLETED'")
			.param("day", day)
			.query(Integer.class)
			.single() > 0;
	}

	Set<LocalDate> completedDays(LocalDate from, LocalDate to) {
		return new HashSet<>(this.jdbc
			.sql("select day from import_day where status = 'COMPLETED' and day between :from and :to")
			.param("from", from)
			.param("to", to)
			.query((rs, rowNum) -> rs.getObject("day", LocalDate.class))
			.list());
	}

	// The same rule the web reads by: a day being re-imported keeps its published_at, so it still counts.
	Optional<LocalDate> latestPublishedDay() {
		return this.jdbc.sql("select day from import_day where published_at is not null order by day desc limit 1")
			.query(LocalDate.class)
			.optional();
	}

	Optional<ImportDayView> find(LocalDate day) {
		return this.jdbc.sql(SELECT + " where day = :day").param("day", day).query(this::toView).optional();
	}

	List<ImportDayView> list(LocalDate from, LocalDate to) {
		return this.jdbc.sql(SELECT + " where day between :from and :to order by day")
			.param("from", from)
			.param("to", to)
			.query(this::toView)
			.list();
	}

	private ImportDayView toView(ResultSet rs, int rowNum) throws SQLException {
		return new ImportDayView(rs.getObject("day", LocalDate.class), rs.getString("status"),
				rs.getObject("stations", Integer.class), rs.getObject("prices", Integer.class),
				instant(rs, "started_at"), instant(rs, "finished_at"), instant(rs, "published_at"),
				rs.getString("error"));
	}

	private static Instant instant(ResultSet rs, String column) throws SQLException {
		OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
		return (value != null) ? value.toInstant() : null;
	}

	private static String truncate(String error) {
		return (error == null || error.length() <= 1000) ? error : error.substring(0, 1000);
	}

}
