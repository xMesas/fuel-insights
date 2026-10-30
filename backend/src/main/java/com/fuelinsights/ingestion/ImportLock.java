package com.fuelinsights.ingestion;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.function.Supplier;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.stereotype.Component;

/**
 * One import at a time in the whole system, whoever starts it (API, backfill, daily catch-up) and on however many
 * instances: a PostgreSQL advisory lock held on its own connection while the work runs. The lock belongs to the
 * database session, so it disappears if the process dies. Holding it is not proof that an older import is dead (its
 * session alone may have been closed), which is why every write also checks the day's owner (fencing token).
 */
@Component
class ImportLock {

	private static final Logger logger = LoggerFactory.getLogger(ImportLock.class);

	// Any number works; it only has to be the same everywhere the import runs.
	static final long LOCK_KEY = 4_861_731L;

	private final DataSource dataSource;

	ImportLock(DataSource dataSource) {
		this.dataSource = dataSource;
	}

	<T> T runExclusively(Supplier<T> work) {
		try (Connection connection = this.dataSource.getConnection()) {
			if (!call(connection, "select pg_try_advisory_lock(?)")) {
				throw new ImportBusyException();
			}
			try {
				return work.get();
			}
			finally {
				release(connection);
			}
		}
		catch (SQLException ex) {
			throw new DataAccessResourceFailureException("Could not use the import lock", ex);
		}
	}

	// Never throws, so it cannot hide the outcome of the work. If the unlock fails, the session is gone or broken:
	// abort the connection so the pool does not hand out a connection that might still hold the lock.
	private void release(Connection connection) {
		try {
			call(connection, "select pg_advisory_unlock(?)");
		}
		catch (SQLException ex) {
			logger.warn("Could not release the import lock, dropping its connection: {}", ex.getMessage());
			try {
				connection.abort(Runnable::run);
			}
			catch (SQLException abortFailure) {
				ex.addSuppressed(abortFailure);
			}
		}
	}

	private static boolean call(Connection connection, String sql) throws SQLException {
		try (PreparedStatement statement = connection.prepareStatement(sql)) {
			statement.setLong(1, LOCK_KEY);
			try (ResultSet result = statement.executeQuery()) {
				return result.next() && result.getBoolean(1);
			}
		}
	}

}
