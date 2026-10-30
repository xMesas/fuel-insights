package com.fuelinsights.accounts;

import java.math.BigDecimal;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.ErrorResponseException;

import com.fuelinsights.premium.PremiumStatus;
import com.fuelinsights.shared.AccountDeleting;
import com.fuelinsights.shared.NoDataException;

/**
 * The writes that have a rule: the free limits and deleting an account. Each runs in one transaction that first locks
 * the account's row, so two requests at once cannot both pass a limit.
 */
@Service
class AccountService {

	private final AccountRepository accounts;

	private final AccountsProperties properties;

	private final PremiumStatus premium;

	private final ApplicationEventPublisher events;

	private final FindByIndexNameSessionRepository<? extends Session> sessions;

	AccountService(AccountRepository accounts, AccountsProperties properties, PremiumStatus premium,
			ApplicationEventPublisher events, FindByIndexNameSessionRepository<? extends Session> sessions) {
		this.accounts = accounts;
		this.properties = properties;
		this.premium = premium;
		this.events = events;
		this.sessions = sessions;
	}

	@Transactional
	void addFavourite(long userId, int stationId) {
		requireStation(stationId);
		this.accounts.lock(userId);
		if (this.accounts.favouriteCount(userId) >= this.properties.maxFavourites()) {
			throw conflict("You can keep up to " + this.properties.maxFavourites() + " favourite stations.");
		}
		this.accounts.addFavourite(userId, stationId);
	}

	/** Creates the alert, or changes its price; true when it is new. */
	@Transactional
	SavedAlert saveAlert(long userId, int stationId, String fuel, BigDecimal threshold) {
		requireStation(stationId);
		this.accounts.lock(userId);
		boolean exists = this.accounts.hasAlert(userId, stationId, fuel);
		if (!exists && !this.premium.isPremium(userId)
				&& this.accounts.alertCount(userId) >= this.properties.freeAlerts()) {
			throw conflict("A free account has up to " + this.properties.freeAlerts() + " alerts.");
		}
		return new SavedAlert(this.accounts.saveAlert(userId, stationId, fuel, threshold), !exists);
	}

	/**
	 * Deletes the account and signs it out everywhere: every session and every sign-in link still valid goes with it,
	 * so no device keeps access to an account created again later with the same email. A paid plan is cancelled
	 * first.
	 */
	@Transactional
	void delete(long userId, String email) {
		this.events.publishEvent(new AccountDeleting(userId));
		this.accounts.delete(userId);
		this.accounts.deleteLinks(email);
		this.sessions.findByPrincipalName(email).keySet().forEach(this.sessions::deleteById);
	}

	private void requireStation(int stationId) {
		if (!this.accounts.stationExists(stationId)) {
			throw new NoDataException("The station " + stationId + " is not known.");
		}
	}

	private static ErrorResponseException conflict(String detail) {
		return new ErrorResponseException(HttpStatus.CONFLICT,
				ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, detail), null);
	}

	record SavedAlert(long id, boolean created) {
	}

}
