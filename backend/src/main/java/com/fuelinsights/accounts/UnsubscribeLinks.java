package com.fuelinsights.accounts;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Component;

/**
 * Links that stop one alert without signing in, as an email must offer. The alert id is signed with HMAC-SHA256, so
 * nobody can stop someone else's alerts by guessing ids.
 */
@Component
class UnsubscribeLinks {

	private final SecretKeySpec key;

	UnsubscribeLinks(AccountsProperties properties) {
		this.key = new SecretKeySpec(properties.signingKey().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
	}

	String signature(long alertId) {
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(this.key);
			byte[] digest = mac.doFinal(("alert-unsubscribe:" + alertId).getBytes(StandardCharsets.UTF_8));
			return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
		}
		catch (GeneralSecurityException ex) {
			throw new IllegalStateException("HmacSHA256 is not available", ex);
		}
	}

	// Compared in constant time, so the answer time does not tell how much of a forged signature was right.
	boolean isValid(long alertId, String signature) {
		return signature != null && MessageDigest.isEqual(signature(alertId).getBytes(StandardCharsets.US_ASCII),
				signature.getBytes(StandardCharsets.US_ASCII));
	}

}
