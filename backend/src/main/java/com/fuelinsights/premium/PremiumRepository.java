package com.fuelinsights.premium;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Subscriptions as Stripe last reported them, and the webhook events already processed. */
@Repository
class PremiumRepository {

	private final JdbcClient jdbc;

	PremiumRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	Optional<Long> userId(String email) {
		return this.jdbc.sql("select id from app_user where email = :email")
			.param("email", email)
			.query(Long.class)
			.optional();
	}

	boolean userExists(long userId) {
		return this.jdbc.sql("select exists (select 1 from app_user where id = :id)")
			.param("id", userId)
			.query(Boolean.class)
			.single();
	}

	Optional<Subscription> subscription(long userId) {
		return this.jdbc.sql("""
				select stripe_customer, stripe_subscription, status, current_period_end
				from subscription
				where user_id = :user
				""").param("user", userId).query(Subscription.class).optional();
	}

	/** True the first time an event id is seen: a repeated delivery is then skipped. */
	boolean firstDelivery(String eventId, String type) {
		return this.jdbc.sql("insert into stripe_event (id, type) values (:id, :type) on conflict do nothing")
			.param("id", eventId)
			.param("type", type)
			.update() == 1;
	}

	/** Applies an event unless a newer one was already applied: Stripe does not deliver them in order. */
	void save(long userId, String customer, String subscription, String status, Instant currentPeriodEnd,
			long eventCreated) {
		this.jdbc.sql("""
				insert into subscription (user_id, stripe_customer, stripe_subscription, status, current_period_end,
					last_event_created)
				values (:user, :customer, :subscription, :status, :periodEnd, :eventCreated)
				on conflict (user_id) do update set stripe_customer = excluded.stripe_customer,
					stripe_subscription = excluded.stripe_subscription, status = excluded.status,
					current_period_end = excluded.current_period_end, last_event_created = excluded.last_event_created,
					updated_at = now()
				where subscription.last_event_created <= excluded.last_event_created
				""")
			.param("user", userId)
			.param("customer", customer)
			.param("subscription", subscription)
			.param("status", status)
			.param("periodEnd", (currentPeriodEnd != null) ? Timestamp.from(currentPeriodEnd) : null)
			.param("eventCreated", eventCreated)
			.update();
	}

	record Subscription(String stripeCustomer, String stripeSubscription, String status,
			OffsetDateTime currentPeriodEnd) {

		static final Set<String> ENDED = Set.of("canceled", "incomplete_expired");

		/** Over for good: nothing more will be charged for it. */
		boolean ended() {
			return ENDED.contains(this.status);
		}

		/** Paying now: Stripe says active (or in a trial), and the paid period has not ended. */
		boolean active(Instant now) {
			return ("active".equals(this.status) || "trialing".equals(this.status))
					&& (this.currentPeriodEnd == null || this.currentPeriodEnd.toInstant().isAfter(now));
		}

	}

}
