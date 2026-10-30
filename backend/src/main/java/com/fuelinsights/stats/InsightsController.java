package com.fuelinsights.stats;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.WebRequest;

import com.fuelinsights.prices.Fuel;
import com.fuelinsights.prices.VersionedAnswers;
import com.fuelinsights.stats.InsightsResponses.BrandsResponse;
import com.fuelinsights.stats.InsightsResponses.SpreadResponse;
import com.fuelinsights.stats.InsightsResponses.WeekdayResponse;

/** Read API for the statistics tab, cached by the version of the data ({@link VersionedAnswers}). */
@RestController
@RequestMapping("/api/stats")
class InsightsController {

	private final InsightsService insights;

	private final VersionedAnswers answers;

	InsightsController(InsightsService insights, VersionedAnswers answers) {
		this.insights = insights;
		this.answers = answers;
	}

	@GetMapping("/weekdays")
	ResponseEntity<WeekdayResponse> weekdays(@RequestParam Fuel fuel, WebRequest request) {
		return this.answers.respond(request, "weekdays-" + fuel.name(), () -> this.insights.weekdays(fuel));
	}

	@GetMapping("/spread")
	ResponseEntity<SpreadResponse> spread(@RequestParam Fuel fuel, WebRequest request) {
		return this.answers.respond(request, "spread-" + fuel.name(), () -> this.insights.spread(fuel));
	}

	@GetMapping("/brands")
	ResponseEntity<BrandsResponse> brands(@RequestParam Fuel fuel, WebRequest request) {
		return this.answers.respond(request, "brands-" + fuel.name(), () -> this.insights.brands(fuel));
	}

}
