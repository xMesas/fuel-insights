package com.fuelinsights.premium;

import com.stripe.exception.SignatureVerificationException;
import com.stripe.net.Webhook;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/** Paying for the ad-free plan, managing it, and Stripe's webhook. */
@RestController
class PremiumController {

	// Stripe signs every webhook with its time; an older signature is refused, so a captured one cannot be replayed.
	private static final long SIGNATURE_TOLERANCE_SECONDS = 300;

	private final PremiumService premium;

	private final PremiumProperties properties;

	private final JsonMapper json;

	PremiumController(PremiumService premium, PremiumProperties properties, JsonMapper json) {
		this.premium = premium;
		this.properties = properties;
		this.json = json;
	}

	/** Where to send the browser to pay: Stripe's own page. */
	@PostMapping("/api/me/premium/checkout")
	Redirect checkout(@AuthenticationPrincipal UserDetails user) {
		return new Redirect(this.premium.checkout(user.getUsername()));
	}

	/** Where to send the browser to cancel or change the card: Stripe's customer portal. */
	@PostMapping("/api/me/premium/portal")
	Redirect portal(@AuthenticationPrincipal UserDetails user) {
		return new Redirect(this.premium.portal(user.getUsername()));
	}

	/** The raw body is needed: the signature covers the exact bytes Stripe sent. */
	@PostMapping("/api/stripe/webhook")
	ResponseEntity<Void> webhook(@RequestBody(required = false) String payload,
			@RequestHeader(name = "Stripe-Signature", required = false) String signature) {
		if (!this.properties.enabled()) {
			return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
		}
		if (payload == null || signature == null) {
			return ResponseEntity.badRequest().build();
		}
		try {
			Webhook.Signature.verifyHeader(payload, signature, this.properties.webhookSecret(),
					SIGNATURE_TOLERANCE_SECONDS);
			this.premium.handle(this.json.readValue(payload, StripeEvent.class));
			return ResponseEntity.noContent().build();
		}
		catch (SignatureVerificationException | JacksonException ex) {
			return ResponseEntity.badRequest().build();
		}
	}

	record Redirect(String url) {
	}

}
