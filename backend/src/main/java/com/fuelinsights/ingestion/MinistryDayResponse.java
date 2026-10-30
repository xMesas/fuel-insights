package com.fuelinsights.ingestion;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** Body of {@code EstacionesTerrestresHist/{date}}: a status text and the list of stations. */
@JsonIgnoreProperties(ignoreUnknown = true)
record MinistryDayResponse(
		@JsonProperty("ResultadoConsulta") String result,
		@JsonProperty("ListaEESSPrecio") List<MinistryStation> stations) {

	boolean isOk() {
		return "OK".equals(this.result) && this.stations != null && !this.stations.isEmpty();
	}

}
