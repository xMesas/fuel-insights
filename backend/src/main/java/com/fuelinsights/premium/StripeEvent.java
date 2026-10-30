package com.fuelinsights.premium;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * The few fields of a Stripe webhook event the site reads. Reading only these, instead of the library's full model,
 * keeps the webhook working when Stripe adds fields or the account uses another API version.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
record StripeEvent(String id, String type, long created, Data data) {

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Data(Subscription object) {
	}

	/** A subscription object; its period end moved to the items in recent API versions, so both are read. */
	@JsonIgnoreProperties(ignoreUnknown = true)
	record Subscription(String id, String object, String customer, String status, Map<String, String> metadata,
			Items items, @JsonProperty("current_period_end") Long currentPeriodEnd) {

		Long periodEnd() {
			if (this.items != null && this.items.data() != null && !this.items.data().isEmpty()
					&& this.items.data().getFirst().currentPeriodEnd() != null) {
				return this.items.data().getFirst().currentPeriodEnd();
			}
			return this.currentPeriodEnd;
		}

	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Items(List<Item> data) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Item(@JsonProperty("current_period_end") Long currentPeriodEnd) {
	}

}
