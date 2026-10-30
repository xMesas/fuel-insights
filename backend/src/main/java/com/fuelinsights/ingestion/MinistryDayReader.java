package com.fuelinsights.ingestion;

import java.time.LocalDate;
import java.util.Collections;
import java.util.Iterator;

import org.springframework.batch.infrastructure.item.ExecutionContext;
import org.springframework.batch.infrastructure.item.ItemStreamReader;

/**
 * Downloads the day once, in {@code open()}, which the step calls before any chunk transaction starts; then hands
 * out the stations one by one. It keeps no position: a restart downloads and reads the whole day again.
 */
class MinistryDayReader implements ItemStreamReader<MinistryStation> {

	private final MinistryClient client;

	private final LocalDate date;

	private Iterator<MinistryStation> stations = Collections.emptyIterator();

	MinistryDayReader(MinistryClient client, LocalDate date) {
		this.client = client;
		this.date = date;
	}

	@Override
	public void open(ExecutionContext executionContext) {
		this.stations = this.client.fetchStations(this.date).iterator();
	}

	@Override
	public MinistryStation read() {
		return this.stations.hasNext() ? this.stations.next() : null;
	}

}
