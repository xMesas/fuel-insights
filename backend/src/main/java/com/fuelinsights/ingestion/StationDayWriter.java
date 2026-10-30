package com.fuelinsights.ingestion;

import java.time.LocalDate;

import org.springframework.batch.infrastructure.item.Chunk;
import org.springframework.batch.infrastructure.item.ItemWriter;

import com.fuelinsights.prices.PriceRepository;
import com.fuelinsights.stations.StationRepository;

/**
 * Stores one chunk of stations and their prices. Every write is an upsert, so a retried chunk does no harm, and it
 * first checks that this execution still owns the day.
 */
class StationDayWriter implements ItemWriter<StationDay> {

	private final StationRepository stations;

	private final PriceRepository prices;

	private final ImportDayRepository importDays;

	private final LocalDate date;

	private final long execution;

	StationDayWriter(StationRepository stations, PriceRepository prices, ImportDayRepository importDays,
			LocalDate date, long execution) {
		this.stations = stations;
		this.prices = prices;
		this.importDays = importDays;
		this.date = date;
		this.execution = execution;
	}

	@Override
	public void write(Chunk<? extends StationDay> chunk) {
		this.importDays.checkOwner(this.date, this.execution);
		this.stations.upsertAll(this.date, chunk.getItems().stream().map(StationDay::station).toList());
		this.prices.upsertAll(this.date,
				chunk.getItems().stream().flatMap((stationDay) -> stationDay.prices().stream()).toList());
	}

}
