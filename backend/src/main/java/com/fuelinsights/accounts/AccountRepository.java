package com.fuelinsights.accounts;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Accounts, their favourite stations and their price alerts. Every query is scoped to one user. */
@Repository
class AccountRepository {

	private final JdbcClient jdbc;

	AccountRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** The account of an email, created the first time its sign-in link is used. */
	long findOrCreate(String email) {
		return this.jdbc.sql("""
				insert into app_user (email) values (:email)
				on conflict (email) do update set email = excluded.email
				returning id
				""").param("email", email).query(Long.class).single();
	}

	Optional<Long> userId(String email) {
		return this.jdbc.sql("select id from app_user where email = :email").param("email", email).query(Long.class)
			.optional();
	}

	void signedIn(String email, Instant at) {
		this.jdbc.sql("update app_user set last_login_at = :at where email = :email")
			.param("at", Timestamp.from(at))
			.param("email", email)
			.update();
	}

	/** Holds the account's row until the transaction ends, so its limits are checked one request at a time. */
	void lock(long userId) {
		this.jdbc.sql("select id from app_user where id = :id for update").param("id", userId).query(Long.class).list();
	}

	/** Sign-in links still waiting for this email: they must not open an account deleted meanwhile. */
	void deleteLinks(String email) {
		this.jdbc.sql("delete from one_time_tokens where username = :email").param("email", email).update();
	}

	/** Deletes the account; its favourites and alerts go with it (on delete cascade). */
	void delete(long userId) {
		this.jdbc.sql("delete from app_user where id = :id").param("id", userId).update();
	}

	/** Sign-in links of an email still valid at {@code now}: each request makes one, so this counts recent ones. */
	int validLinks(String email, Instant now) {
		return this.jdbc.sql("select count(*) from one_time_tokens where username = :email and expires_at > :now")
			.param("email", email)
			.param("now", Timestamp.from(now))
			.query(Integer.class)
			.single();
	}

	boolean stationExists(int stationId) {
		return this.jdbc.sql("select exists (select 1 from station where id = :id)")
			.param("id", stationId)
			.query(Boolean.class)
			.single();
	}

	List<StationRow> favourites(long userId) {
		return this.jdbc.sql("""
				select s.id, s.brand_raw as name, s.municipality, s.province_id
				from favourite_station f
				join station s on s.id = f.station_id
				where f.user_id = :user
				order by f.created_at, s.id
				""").param("user", userId).query(StationRow.class).list();
	}

	int favouriteCount(long userId) {
		return this.jdbc.sql("select count(*) from favourite_station where user_id = :user")
			.param("user", userId)
			.query(Integer.class)
			.single();
	}

	void addFavourite(long userId, int stationId) {
		this.jdbc.sql("""
				insert into favourite_station (user_id, station_id) values (:user, :station)
				on conflict do nothing
				""").param("user", userId).param("station", stationId).update();
	}

	void removeFavourite(long userId, int stationId) {
		this.jdbc.sql("delete from favourite_station where user_id = :user and station_id = :station")
			.param("user", userId)
			.param("station", stationId)
			.update();
	}

	List<PriceRow> currentPrices(List<Integer> stationIds) {
		if (stationIds.isEmpty()) {
			return List.of();
		}
		return this.jdbc.sql("select station_id, fuel, price from price_current where station_id in (:ids)")
			.param("ids", stationIds)
			.query(PriceRow.class)
			.list();
	}

	List<AlertRow> alerts(long userId) {
		return this.jdbc.sql("""
				select a.id, a.station_id, s.brand_raw as station_name, s.municipality, a.fuel, a.threshold,
					p.price as current_price, a.last_sent_at
				from price_alert a
				join station s on s.id = a.station_id
				left join price_current p on p.station_id = a.station_id and p.fuel = a.fuel
				where a.user_id = :user
				order by a.created_at, a.id
				""").param("user", userId).query(AlertRow.class).list();
	}

	int alertCount(long userId) {
		return this.jdbc.sql("select count(*) from price_alert where user_id = :user")
			.param("user", userId)
			.query(Integer.class)
			.single();
	}

	boolean hasAlert(long userId, int stationId, String fuel) {
		return this.jdbc.sql("""
				select exists (select 1 from price_alert where user_id = :user and station_id = :station and fuel = :fuel)
				""").param("user", userId).param("station", stationId).param("fuel", fuel).query(Boolean.class).single();
	}

	/** One alert per station and fuel: asking again changes its price and lets it be sent again. */
	long saveAlert(long userId, int stationId, String fuel, BigDecimal threshold) {
		return this.jdbc.sql("""
				insert into price_alert (user_id, station_id, fuel, threshold) values (:user, :station, :fuel, :threshold)
				on conflict (user_id, station_id, fuel) do update set threshold = excluded.threshold, last_sent_at = null
				returning id
				""")
			.param("user", userId)
			.param("station", stationId)
			.param("fuel", fuel)
			.param("threshold", threshold)
			.query(Long.class)
			.single();
	}

	boolean deleteAlert(long userId, long alertId) {
		return this.jdbc.sql("delete from price_alert where id = :id and user_id = :user")
			.param("id", alertId)
			.param("user", userId)
			.update() == 1;
	}

	boolean deleteAlert(long alertId) {
		return this.jdbc.sql("delete from price_alert where id = :id").param("id", alertId).update() == 1;
	}

	/**
	 * Marks as sent, and returns, the alerts whose station now sells their fuel at their price or less and that were
	 * not sent in the last day. Marking and reading in one statement means two instances never send the same one.
	 */
	List<DueAlert> claimDueAlerts(Instant now) {
		return this.jdbc.sql("""
				update price_alert a set last_sent_at = :now
				from price_current p, station s, app_user u
				where p.station_id = a.station_id and p.fuel = a.fuel and p.price <= a.threshold
					and s.id = a.station_id and u.id = a.user_id
					and (a.last_sent_at is null or a.last_sent_at < cast(:now as timestamptz) - interval '1 day')
				returning a.id, u.email, a.station_id, s.brand_raw as station_name, s.municipality, a.fuel,
					a.threshold, p.price
				""").param("now", Timestamp.from(now)).query(DueAlert.class).list();
	}

	record StationRow(int id, String name, String municipality, String provinceId) {
	}

	record PriceRow(int stationId, String fuel, BigDecimal price) {
	}

	record AlertRow(long id, int stationId, String stationName, String municipality, String fuel,
			BigDecimal threshold, BigDecimal currentPrice, OffsetDateTime lastSentAt) {
	}

	record DueAlert(long id, String email, int stationId, String stationName, String municipality, String fuel,
			BigDecimal threshold, BigDecimal price) {
	}

}
