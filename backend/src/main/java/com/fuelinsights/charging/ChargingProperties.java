package com.fuelinsights.charging;

import java.net.URI;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Where the charging feed lives. */
@ConfigurationProperties("fuel-insights.charging")
record ChargingProperties(URI feedUrl) {
}
