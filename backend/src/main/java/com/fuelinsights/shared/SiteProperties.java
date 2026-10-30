package com.fuelinsights.shared;

import java.net.URI;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** The public address of the site: absolute links in the sitemap, robots.txt and the emails. */
@ConfigurationProperties("fuel-insights.site")
public record SiteProperties(URI origin) {

	/** The origin without a trailing slash, ready to append a path. */
	public String link(String path) {
		return this.origin.toString().replaceAll("/+$", "") + path;
	}

}
