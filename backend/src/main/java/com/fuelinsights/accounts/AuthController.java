package com.fuelinsights.accounts;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The parts of signing in that Spring Security leaves to the app: a sign-in request without a valid address (the
 * filter passes it on), and the one-click unsubscribe of an alert email.
 */
@RestController
class AuthController {

	private final AccountRepository accounts;

	private final UnsubscribeLinks unsubscribe;

	AuthController(AccountRepository accounts, UnsubscribeLinks unsubscribe) {
		this.accounts = accounts;
		this.unsubscribe = unsubscribe;
	}

	@PostMapping("/api/auth/link")
	ResponseEntity<ProblemDetail> invalidEmail() {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
				"The email address is not valid.");
		problem.setTitle("Invalid email");
		return ResponseEntity.badRequest().body(problem);
	}

	/** Answers 204 for a valid link even if the alert is already gone, so a second click is not an error. */
	@PostMapping("/api/alerts/unsubscribe")
	ResponseEntity<Void> unsubscribe(@RequestParam long alert, @RequestParam String signature) {
		if (!this.unsubscribe.isValid(alert, signature)) {
			return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
		}
		this.accounts.deleteAlert(alert);
		return ResponseEntity.noContent().build();
	}

}
