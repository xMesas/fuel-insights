package com.fuelinsights.ingestion;

import java.util.List;

import com.fuelinsights.prices.DailyPrice;
import com.fuelinsights.stations.Station;

/** One processed station and the prices it published that day: the item the writer stores. */
record StationDay(Station station, List<DailyPrice> prices) {
}
