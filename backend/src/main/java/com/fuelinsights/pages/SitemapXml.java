package com.fuelinsights.pages;

import org.springframework.web.util.HtmlUtils;

import com.fuelinsights.pages.PagesService.Sitemap;
import com.fuelinsights.shared.SiteProperties;

/** The sitemaps.org format: one {@code <url>} per page, under the 50,000 a single file may hold. */
final class SitemapXml {

	static final int MAX_URLS = 50_000;

	private SitemapXml() {
	}

	static String write(SiteProperties site, Sitemap sitemap) {
		if (sitemap.paths().size() > MAX_URLS) {
			throw new IllegalStateException(
					"The sitemap has " + sitemap.paths().size() + " addresses; split it into an index.");
		}
		String lastModified = sitemap.lastModified().toString();
		StringBuilder xml = new StringBuilder(sitemap.paths().size() * 110);
		xml.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
		xml.append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
		for (String path : sitemap.paths()) {
			xml.append("<url><loc>")
				.append(HtmlUtils.htmlEscape(site.link(path)))
				.append("</loc><lastmod>")
				.append(lastModified)
				.append("</lastmod></url>\n");
		}
		return xml.append("</urlset>\n").toString();
	}

}
