package com.fuelinsights.charging;

/** The charging feed could not be downloaded or read. The import logs it and tries again at its next run. */
class ChargingFeedException extends RuntimeException {

	ChargingFeedException(String reason, Throwable cause) {
		super("Charging sites not downloaded: " + reason, cause);
	}

}
