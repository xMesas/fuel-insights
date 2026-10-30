package com.fuelinsights.ingestion;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** Another import is running; rendered as a 409 problem detail. */
public class ImportBusyException extends ErrorResponseException {

	public ImportBusyException() {
		this("Another import is running. Try again when it finishes.");
	}

	public ImportBusyException(String detail) {
		super(HttpStatus.CONFLICT, problem(detail), null);
	}

	private static ProblemDetail problem(String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, detail);
		problem.setTitle("Import busy");
		return problem;
	}

}
