package com.fuelinsights.stats;

/** Spain ({@code ES}) or one province, as the filters show it. */
public record AreaView(String id, String name) {

	static final AreaView SPAIN = new AreaView("ES", "España");

}
