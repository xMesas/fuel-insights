package com.fuelinsights.ingestion;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.batch.infrastructure.item.ItemProcessor;
import org.springframework.stereotype.Component;

import com.fuelinsights.stations.Station;

/** Translates a raw Ministry station; a row that cannot be read is logged and left out (returning null filters it). */
@Component
class StationProcessor implements ItemProcessor<MinistryStation, StationDay> {

	private static final Logger logger = LoggerFactory.getLogger(StationProcessor.class);

	private final BrandNormalizer brands;

	StationProcessor(BrandNormalizer brands) {
		this.brands = brands;
	}

	@Override
	public StationDay process(MinistryStation raw) {
		try {
			Station station = raw.toStation();
			return new StationDay(station.withBrand(this.brands.normalize(station.brandRaw())), raw.prices());
		}
		catch (RuntimeException ex) {
			logger.warn("Skipping station {}: {}", raw.id(), ex.getMessage());
			return null;
		}
	}

}
