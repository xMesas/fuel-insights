package com.fuelinsights.ingestion;

import java.time.LocalDate;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** The import job failed for a reason other than the Ministry; rendered as a 500 problem detail. */
public class ImportFailedException extends ErrorResponseException {

	public ImportFailedException(LocalDate date, Throwable cause) {
		super(HttpStatus.INTERNAL_SERVER_ERROR, problem(date), cause);
	}

	private static ProblemDetail problem(LocalDate date) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR,
				"The import of " + date + " failed. Its error is in GET /api/imports.");
		problem.setTitle("Import failed");
		return problem;
	}

}
