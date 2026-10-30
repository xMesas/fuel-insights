package com.fuelinsights.premium;

/** The payment provider, behind an interface: tests use a fake, the site uses Stripe. */
interface PaymentGateway {

	/**
	 * The address of the provider's payment page for this account; {@code customer} is null the first time. The same
	 * {@code attempt} gives back the same page, so two clicks never start two plans.
	 */
	String checkout(long userId, String email, String customer, String attempt);

	/** The address where the customer cancels the plan or changes the card. */
	String portal(String customer);

	void cancel(String subscription);

}
