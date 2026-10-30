package com.fuelinsights.premium;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Stripe's keys and the price of the plan, all from the Stripe dashboard (test mode keys start with {@code sk_test_}).
 * While any is missing the plan is off: its endpoints answer 503 and the rest of the site works as before.
 */
@ConfigurationProperties("fuel-insights.premium")
record PremiumProperties(String stripeSecretKey, String webhookSecret, String priceId) {

	boolean enabled() {
		return isSet(this.stripeSecretKey) && isSet(this.webhookSecret) && isSet(this.priceId);
	}

	private static boolean isSet(String value) {
		return value != null && !value.isBlank();
	}

}
