package com.fuelinsights.stats;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.format.annotation.DateTimeFormat.ISO;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.WebRequest;

import com.fuelinsights.prices.Fuel;
import com.fuelinsights.prices.FuelView;
import com.fuelinsights.prices.VersionedAnswers;

/** Read API for the web. The daily figures change only with the data, so they are cached by its version. */
@RestController
@RequestMapping("/api")
class StatsController {

	private final StatsService statsService;

	private final VersionedAnswers answers;

	StatsController(StatsService statsService, VersionedAnswers answers) {
		this.statsService = statsService;
		this.answers = answers;
	}

	@GetMapping("/fuels")
	List<FuelView> fuels() {
		return Arrays.stream(Fuel.values()).map(FuelView::of).toList();
	}

	@GetMapping("/areas")
	List<AreaView> areas() {
		return this.statsService.areas();
	}

	@GetMapping("/stats/provinces")
	ResponseEntity<ProvinceStatsResponse> provinceStats(@RequestParam Fuel fuel,
			@RequestParam @DateTimeFormat(iso = ISO.DATE) Optional<LocalDate> date, WebRequest request) {
		String resource = "provinces-" + fuel.name() + "-" + date.map(LocalDate::toString).orElse("latest");
		return this.answers.respond(request, resource, () -> this.statsService.provinceStats(fuel, date));
	}

	@GetMapping("/stats/trend")
	ResponseEntity<TrendResponse> trend(@RequestParam Fuel fuel, @RequestParam(defaultValue = "ES") String area,
			@RequestParam @DateTimeFormat(iso = ISO.DATE) Optional<LocalDate> from,
			@RequestParam @DateTimeFormat(iso = ISO.DATE) Optional<LocalDate> to, WebRequest request) {
		String resource = "trend-" + fuel.name() + "-" + area + "-" + from.map(LocalDate::toString).orElse("") + "-"
				+ to.map(LocalDate::toString).orElse("");
		return this.answers.respond(request, resource, () -> this.statsService.trend(fuel, area, from, to));
	}

}
