package com.fuelinsights.accounts;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fuelinsights.accounts.AccountRepository.AlertRow;
import com.fuelinsights.accounts.AccountRepository.PriceRow;
import com.fuelinsights.premium.PremiumStatus;
import com.fuelinsights.prices.Fuel;
import com.fuelinsights.shared.NoDataException;
import com.fuelinsights.shared.PlaceName;

/** The signed-in person's account: who they are, their favourite stations and their price alerts. */
@RestController
@RequestMapping("/api/me")
class MeController {

	private final AccountRepository accounts;

	private final AccountsProperties properties;

	private final PremiumStatus premium;

	private final AccountService service;

	MeController(AccountRepository accounts, AccountsProperties properties, PremiumStatus premium,
			AccountService service) {
		this.accounts = accounts;
		this.properties = properties;
		this.premium = premium;
		this.service = service;
	}

	/** 204 when nobody is signed in: the web asks on every page, and a visitor is not an error. */
	@GetMapping
	ResponseEntity<Me> me(@AuthenticationPrincipal UserDetails user) {
		Long userId = (user != null) ? this.accounts.userId(user.getUsername()).orElse(null) : null;
		if (userId == null) {
			return ResponseEntity.noContent().build();
		}
		boolean premium = this.premium.isPremium(userId);
		return ResponseEntity.ok(new Me(user.getUsername(), premium, premium ? null : this.properties.freeAlerts()));
	}

	/** Deletes the account and everything in it and signs it out on every device (see AccountService). */
	@DeleteMapping
	ResponseEntity<Void> delete(@AuthenticationPrincipal UserDetails user, HttpServletRequest request)
			throws ServletException {
		this.service.delete(userId(user), user.getUsername());
		request.logout();
		return ResponseEntity.noContent().build();
	}

	@GetMapping("/favourites")
	List<Favourite> favourites(@AuthenticationPrincipal UserDetails user) {
		var stations = this.accounts.favourites(userId(user));
		Map<Integer, Map<String, BigDecimal>> prices = new LinkedHashMap<>();
		for (PriceRow row : this.accounts.currentPrices(stations.stream().map((station) -> station.id()).toList())) {
			prices.computeIfAbsent(row.stationId(), (id) -> new LinkedHashMap<>()).put(row.fuel(), row.price());
		}
		return stations.stream()
			.map((station) -> new Favourite(station.id(), station.name(), town(station.municipality()),
					station.provinceId(), prices.getOrDefault(station.id(), Map.of())))
			.toList();
	}

	@PutMapping("/favourites/{stationId}")
	ResponseEntity<Void> addFavourite(@AuthenticationPrincipal UserDetails user, @PathVariable int stationId) {
		this.service.addFavourite(userId(user), stationId);
		return ResponseEntity.noContent().build();
	}

	@DeleteMapping("/favourites/{stationId}")
	ResponseEntity<Void> removeFavourite(@AuthenticationPrincipal UserDetails user, @PathVariable int stationId) {
		this.accounts.removeFavourite(userId(user), stationId);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("/alerts")
	List<Alert> alerts(@AuthenticationPrincipal UserDetails user) {
		return this.accounts.alerts(userId(user)).stream().map(MeController::alert).toList();
	}

	/** Creates the alert, or changes its price if the station and fuel already have one. */
	@PostMapping("/alerts")
	ResponseEntity<Alert> saveAlert(@AuthenticationPrincipal UserDetails user,
			@Valid @RequestBody AlertRequest request) {
		long userId = userId(user);
		var result = this.service.saveAlert(userId, request.stationId(), request.fuel().name(), request.threshold());
		Alert saved = this.accounts.alerts(userId)
			.stream()
			.filter((row) -> row.id() == result.id())
			.map(MeController::alert)
			.findFirst()
			.orElseThrow();
		return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK).body(saved);
	}

	@DeleteMapping("/alerts/{id}")
	ResponseEntity<Void> deleteAlert(@AuthenticationPrincipal UserDetails user, @PathVariable long id) {
		if (!this.accounts.deleteAlert(userId(user), id)) {
			throw new NoDataException("You have no alert " + id + ".");
		}
		return ResponseEntity.noContent().build();
	}

	// The session may outlive the account (deleted in another tab): then it is no longer signed in.
	private long userId(UserDetails user) {
		return this.accounts.userId(user.getUsername())
			.orElseThrow(() -> new ErrorResponseException(HttpStatus.UNAUTHORIZED));
	}

	private static Alert alert(AlertRow row) {
		return new Alert(row.id(), row.stationId(), row.stationName(), town(row.municipality()), row.fuel(),
				row.threshold(), row.currentPrice(), row.lastSentAt());
	}

	private static String town(String municipality) {
		return (municipality != null) ? PlaceName.display(municipality) : null;
	}

	/** {@code alertLimit}: how many alerts the account may have, or null without a limit (the paid plan). */
	record Me(String email, boolean premium, Integer alertLimit) {
	}

	/** {@code prices} by fuel code, the ones the station sells now. */
	record Favourite(int id, String name, String town, String provinceId, Map<String, BigDecimal> prices) {
	}

	/** {@code currentPrice} is null when the station does not sell the fuel now. */
	record Alert(long id, int stationId, String stationName, String town, String fuel, BigDecimal threshold,
			BigDecimal currentPrice, OffsetDateTime lastSentAt) {
	}

	record AlertRequest(int stationId, @NotNull Fuel fuel,
			@NotNull @DecimalMin("0.100") @DecimalMax("9.999") BigDecimal threshold) {
	}

}
