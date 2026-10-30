package com.fuelinsights;

import org.springframework.boot.SpringApplication;

public class TestFuelInsightsApplication {

	public static void main(String[] args) {
		SpringApplication.from(FuelInsightsApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
