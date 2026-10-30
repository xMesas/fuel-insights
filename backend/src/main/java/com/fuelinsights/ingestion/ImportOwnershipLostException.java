package com.fuelinsights.ingestion;

import java.time.LocalDate;

/** A newer import took over the day, so this execution must stop writing. */
class ImportOwnershipLostException extends RuntimeException {

	ImportOwnershipLostException(LocalDate day, long execution, Long owner) {
		super("Execution " + execution + " no longer owns " + day + " (owner: " + owner + ")");
	}

}
