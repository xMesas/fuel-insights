package com.fuelinsights.accounts;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.context.event.EventListener;
import org.springframework.mail.MailException;
import org.springframework.stereotype.Component;

import com.fuelinsights.accounts.AccountRepository.DueAlert;
import com.fuelinsights.prices.CurrentPricesUpdated;

/**
 * Sends the price alerts when the Ministry publishes new prices. The import only announces the new list; it does not
 * know that alerts exist.
 */
@Component
class AlertSender {

	private static final Logger logger = LoggerFactory.getLogger(AlertSender.class);

	private final AccountRepository accounts;

	private final Mailer mailer;

	private final Clock clock;

	AlertSender(AccountRepository accounts, Mailer mailer, Clock clock) {
		this.accounts = accounts;
		this.mailer = mailer;
		this.clock = clock;
	}

	/**
	 * An alert is marked as sent before its email goes out: if the mail server fails, that alert waits until
	 * tomorrow instead of being sent twice.
	 */
	@EventListener
	void pricesUpdated(CurrentPricesUpdated event) {
		var due = this.accounts.claimDueAlerts(this.clock.instant());
		int sent = 0;
		for (DueAlert alert : due) {
			try {
				this.mailer.sendAlert(alert, event.publishedAt());
				sent++;
			}
			catch (MailException ex) {
				logger.warn("Price alert {} not sent: {}", alert.id(), ex.getMessage());
			}
		}
		if (!due.isEmpty()) {
			logger.info("Price alerts: {} sent of {} due", sent, due.size());
		}
	}

}
