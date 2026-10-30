package com.fuelinsights.geocoding;

import java.net.URI;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Where CartoCiudad's geocoder lives. */
@ConfigurationProperties("fuel-insights.geocoding")
record GeocodingProperties(URI baseUrl) {
}
