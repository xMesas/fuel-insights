package com.fuelinsights.premium;

import com.stripe.StripeClient;
import com.stripe.exception.StripeException;
import com.stripe.net.RequestOptions;
import com.stripe.param.checkout.SessionCreateParams;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.ErrorResponseException;

import com.fuelinsights.shared.SiteProperties;

/**
 * Stripe Checkout for paying, the Customer Portal for cancelling or changing the card. The card never touches this
 * site: Stripe hosts both pages and tells the site what happened through the webhook.
 */
@Component
class StripeGateway implements PaymentGateway {

	private final PremiumProperties properties;

	private final SiteProperties site;

	StripeGateway(PremiumProperties properties, SiteProperties site) {
		this.properties = properties;
		this.site = site;
	}

	@Override
	public String checkout(long userId, String email, String customer, String attempt) {
		var subscription = SessionCreateParams.SubscriptionData.builder()
			.putMetadata(PremiumService.USER_ID, String.valueOf(userId))
			.build();
		var params = SessionCreateParams.builder()
			.setMode(SessionCreateParams.Mode.SUBSCRIPTION)
			.addLineItem(SessionCreateParams.LineItem.builder()
				.setPrice(this.properties.priceId())
				.setQuantity(1L)
				.build())
			.setClientReferenceId(String.valueOf(userId))
			.setSubscriptionData(subscription)
			.setLocale(SessionCreateParams.Locale.ES)
			.setSuccessUrl(this.site.link("/mis-gasolineras?sin-anuncios=gracias"))
			.setCancelUrl(this.site.link("/mis-gasolineras"));
		if (customer != null) {
			params.setCustomer(customer);
		}
		else {
			params.setCustomerEmail(email);
		}
		// Stripe answers a repeated idempotency key with the first result instead of creating a second session.
		RequestOptions options = RequestOptions.builder().setIdempotencyKey(attempt).build();
		return call(() -> client().v1().checkout().sessions().create(params.build(), options).getUrl());
	}

	@Override
	public String portal(String customer) {
		var params = com.stripe.param.billingportal.SessionCreateParams.builder()
			.setCustomer(customer)
			.setReturnUrl(this.site.link("/mis-gasolineras"))
			.build();
		return call(() -> client().v1().billingPortal().sessions().create(params).getUrl());
	}

	@Override
	public void cancel(String subscription) {
		call(() -> client().v1().subscriptions().cancel(subscription));
	}

	private StripeClient client() {
		return new StripeClient(this.properties.stripeSecretKey());
	}

	private static <T> T call(StripeCall<T> call) {
		try {
			return call.run();
		}
		catch (StripeException ex) {
			throw new ErrorResponseException(HttpStatus.SERVICE_UNAVAILABLE, ex);
		}
	}

	@FunctionalInterface
	private interface StripeCall<T> {

		T run() throws StripeException;

	}

}
