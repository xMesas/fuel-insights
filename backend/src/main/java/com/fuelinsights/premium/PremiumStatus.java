package com.fuelinsights.premium;

/** What other modules may ask about the paid plan. */
public interface PremiumStatus {

	boolean isPremium(long userId);

}
