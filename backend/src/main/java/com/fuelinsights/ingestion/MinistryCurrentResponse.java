package com.fuelinsights.ingestion;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** Body of {@code EstacionesTerrestres/}: the prices in force now, with the Ministry's time for them. */
@JsonIgnoreProperties(ignoreUnknown = true)
record MinistryCurrentResponse(
		@JsonProperty("Fecha") String date,
		@JsonProperty("ResultadoConsulta") String result,
		@JsonProperty("ListaEESSPrecio") List<MinistryStation> stations) {

	// One-digit hours too: the history lists write "27/10/2026 0:00:00".
	private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("d/M/yyyy H:mm:ss");

	private static final ZoneId MADRID = ZoneId.of("Europe/Madrid");

	boolean isOk() {
		return "OK".equals(this.result) && this.date != null && this.stations != null && !this.stations.isEmpty();
	}

	/** The Ministry writes Madrid time without a zone: {@code 29/10/2026 13:45:09}. */
	Instant publishedAt() {
		return LocalDateTime.parse(this.date.trim(), DATE_TIME).atZone(MADRID).toInstant();
	}

}
