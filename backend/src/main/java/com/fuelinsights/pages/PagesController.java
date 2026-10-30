package com.fuelinsights.pages;

import java.time.Duration;
import java.util.List;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.WebRequest;

import com.fuelinsights.pages.PageModels.FuelPage;
import com.fuelinsights.pages.PageModels.ProvincePage;
import com.fuelinsights.pages.PageModels.StationPage;
import com.fuelinsights.pages.PageModels.TownPage;
import com.fuelinsights.prices.Fuel;
import com.fuelinsights.prices.VersionedAnswers;
import com.fuelinsights.shared.NoDataException;
import com.fuelinsights.shared.SiteProperties;

/**
 * One answer per search engine page, rendered by the web's server, cached like the map's data
 * ({@link VersionedAnswers}).
 */
@RestController
@RequestMapping("/api")
class PagesController {

	private static final CacheControl FIXED_CACHE = CacheControl.maxAge(Duration.ofDays(1)).cachePublic();

	private final PagesService pages;

	private final VersionedAnswers answers;

	private final SiteProperties site;

	PagesController(PagesService pages, VersionedAnswers answers, SiteProperties site) {
		this.pages = pages;
		this.answers = answers;
		this.site = site;
	}

	// The 52 provinces never change: the footer of every page links them.
	@GetMapping("/pages/provinces")
	ResponseEntity<List<Province>> provinces() {
		return ResponseEntity.ok().cacheControl(FIXED_CACHE).body(Province.ALL);
	}

	@GetMapping("/pages/fuels/{fuel}")
	ResponseEntity<FuelPage> fuel(@PathVariable Fuel fuel, WebRequest request) {
		return this.answers.respond(request, "fuel-" + fuel.name(), () -> this.pages.fuelPage(fuel));
	}

	@GetMapping("/pages/provinces/{province}")
	ResponseEntity<ProvincePage> province(@PathVariable String province, WebRequest request) {
		return this.answers.respond(request, "province-" + province, () -> this.pages.provincePage(province));
	}

	@GetMapping("/pages/provinces/{province}/{town}")
	ResponseEntity<TownPage> town(@PathVariable String province, @PathVariable String town, WebRequest request) {
		return this.answers.respond(request, "town-" + province + "-" + town,
				() -> this.pages.townPage(province, town));
	}

	@GetMapping("/pages/stations/{id}")
	ResponseEntity<StationPage> station(@PathVariable int id, WebRequest request) {
		return this.answers.respond(request, "station-" + id, () -> this.pages.stationPage(id));
	}

	// nginx serves it as /robots.txt: every page may be crawled, and the sitemap lists them.
	@GetMapping(path = "/robots.txt", produces = MediaType.TEXT_PLAIN_VALUE)
	ResponseEntity<String> robots() {
		return ResponseEntity.ok()
			.cacheControl(FIXED_CACHE)
			.body("User-agent: *\nAllow: /\n\nSitemap: " + this.site.link("/sitemap.xml") + "\n");
	}

	// nginx serves it as /sitemap.xml at the root of the site.
	@GetMapping(path = "/sitemap.xml", produces = MediaType.APPLICATION_XML_VALUE)
	ResponseEntity<String> sitemap(WebRequest request) {
		return this.answers.respond(request, "sitemap", () -> this.pages.sitemap()
			.map((sitemap) -> SitemapXml.write(this.site, sitemap))
			.orElseThrow(() -> new NoDataException("No current prices have been imported yet.")));
	}

}
