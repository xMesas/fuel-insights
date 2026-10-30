package com.fuelinsights.geocoding;

import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

/** CartoCiudad did not answer in time or answered an error: the search box keeps working with the towns it has. */
class GeocodingException extends ErrorResponseException {

	GeocodingException(Throwable cause) {
		super(HttpStatus.SERVICE_UNAVAILABLE, cause);
	}

}
