package com.fuelinsights.ingestion;

import java.net.URI;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Where the Ministry API lives. */
@ConfigurationProperties("fuel-insights.ministry")
public record MinistryProperties(URI baseUrl) {
}
