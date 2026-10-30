package com.fuelinsights.ingestion;

import java.time.LocalDate;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** The Ministry API failed or sent no prices; rendered as a 502 problem detail. */
public class MinistryException extends ErrorResponseException {

	public MinistryException(LocalDate date, String reason, Throwable cause) {
		this("the prices of " + date, reason, cause);
	}

	MinistryException(String what, String reason, Throwable cause) {
		super(HttpStatus.BAD_GATEWAY, problem(what, reason), cause);
	}

	private static ProblemDetail problem(String what, String reason) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY,
				"Could not get " + what + " from the Ministry: " + reason);
		problem.setTitle("Ministry API error");
		return problem;
	}

}
