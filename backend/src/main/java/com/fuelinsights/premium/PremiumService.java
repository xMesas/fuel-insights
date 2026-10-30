package com.fuelinsights.premium;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.ErrorResponseException;

import com.fuelinsights.premium.PremiumRepository.Subscription;
import com.fuelinsights.shared.AccountDeleting;
import com.fuelinsights.shared.NoDataException;

/**
 * The ad-free plan. Stripe is the source of truth: the site only stores what Stripe's webhook says about each
 * subscription, and asks Stripe for the pages where people pay or cancel.
 */
@Service
class PremiumService implements PremiumStatus {

	private static final Logger logger = LoggerFactory.getLogger(PremiumService.class);

	/** The metadata key that ties a Stripe subscription to an account, set when the checkout starts. */
	static final String USER_ID = "user_id";

	private static final ZoneId MADRID = ZoneId.of("Europe/Madrid");

	private final PremiumRepository repository;

	private final PaymentGateway gateway;

	private final PremiumProperties properties;

	private final Clock clock;

	PremiumService(PremiumRepository repository, PaymentGateway gateway, PremiumProperties properties, Clock clock) {
		this.repository = repository;
		this.gateway = gateway;
		this.properties = properties;
		this.clock = clock;
	}

	@Override
	@Transactional(readOnly = true)
	public boolean isPremium(long userId) {
		return this.repository.subscription(userId)
			.map((subscription) -> subscription.active(this.clock.instant()))
			.orElse(false);
	}

	String checkout(String email) {
		requireEnabled();
		long userId = userId(email);
		var subscription = this.repository.subscription(userId);
		if (subscription.map((current) -> current.active(this.clock.instant())).orElse(false)) {
			throw new ErrorResponseException(HttpStatus.CONFLICT);
		}
		// One attempt per account and day: a double click, or a second tab, gets the same payment page.
		String attempt = "checkout-" + userId + "-" + LocalDate.now(this.clock.withZone(MADRID));
		return this.gateway.checkout(userId, email, subscription.map(Subscription::stripeCustomer).orElse(null),
				attempt);
	}

	String portal(String email) {
		requireEnabled();
		return this.repository.subscription(userId(email))
			.map((subscription) -> this.gateway.portal(subscription.stripeCustomer()))
			.orElseThrow(() -> new NoDataException("This account has never paid for the plan."));
	}

	/**
	 * One webhook event, in one transaction with its id: a failure leaves no trace, so Stripe's retry processes it
	 * again, and a repeated delivery of a processed event changes nothing.
	 */
	@Transactional
	void handle(StripeEvent event) {
		if (!this.repository.firstDelivery(event.id(), event.type())) {
			return;
		}
		if (!event.type().startsWith("customer.subscription.") || event.data() == null
				|| event.data().object() == null || !"subscription".equals(event.data().object().object())) {
			return;
		}
		StripeEvent.Subscription subscription = event.data().object();
		String userId = (subscription.metadata() != null) ? subscription.metadata().get(USER_ID) : null;
		if (userId == null) {
			// A subscription made outside this site: nothing to update.
			logger.warn("Stripe event {} names no account", event.id());
			return;
		}
		if (!this.repository.userExists(Long.parseLong(userId))) {
			// Paid for an account deleted meanwhile (a checkout finished after the deletion): it must not keep
			// charging someone who can no longer manage it.
			if (!Subscription.ENDED.contains(subscription.status())) {
				this.gateway.cancel(subscription.id());
			}
			return;
		}
		Long periodEnd = subscription.periodEnd();
		this.repository.save(Long.parseLong(userId), subscription.customer(), subscription.id(), subscription.status(),
				(periodEnd != null) ? Instant.ofEpochSecond(periodEnd) : null, event.created());
	}

	/**
	 * An account cancels its plan before it disappears, whatever its state short of ended (an unpaid one still
	 * charges). If Stripe fails, the account is not deleted.
	 */
	@EventListener
	void accountDeleting(AccountDeleting event) {
		this.repository.subscription(event.userId())
			.filter((subscription) -> !subscription.ended())
			.ifPresent((subscription) -> this.gateway.cancel(subscription.stripeSubscription()));
	}

	private long userId(String email) {
		return this.repository.userId(email).orElseThrow(() -> new ErrorResponseException(HttpStatus.UNAUTHORIZED));
	}

	private void requireEnabled() {
		if (!this.properties.enabled()) {
			throw new ErrorResponseException(HttpStatus.SERVICE_UNAVAILABLE);
		}
	}

}
