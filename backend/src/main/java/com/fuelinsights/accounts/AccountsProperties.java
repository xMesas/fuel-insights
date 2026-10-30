package com.fuelinsights.accounts;

import java.time.Duration;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Accounts and their emails. {@code signingKey} signs the unsubscribe links: production reads it from a secret and
 * must not start without one.
 */
@Validated
@ConfigurationProperties("fuel-insights.accounts")
record AccountsProperties(@NotBlank String mailFrom, @NotBlank String signingKey, Duration linkLifetime,
		@Positive int linksPerWindow, @Positive int freeAlerts, @Positive int maxFavourites) {
}
