package com.fuelinsights.prices;

import java.time.Instant;

/**
 * A new list of current prices has been stored (published after its transaction committed). Modules that react to
 * prices, such as the alerts, listen to it instead of the import calling them.
 */
public record CurrentPricesUpdated(Instant publishedAt) {
}
