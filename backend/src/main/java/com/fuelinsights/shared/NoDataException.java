package com.fuelinsights.shared;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** No imported day matches the request; rendered as a 404 problem detail. */
public class NoDataException extends ErrorResponseException {

	public NoDataException(String detail) {
		super(HttpStatus.NOT_FOUND, problem(detail), null);
	}

	private static ProblemDetail problem(String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, detail);
		problem.setTitle("No data");
		return problem;
	}

}
