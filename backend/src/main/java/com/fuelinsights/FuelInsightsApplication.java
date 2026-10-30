package com.fuelinsights;

import java.time.Clock;
import java.time.ZoneId;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.context.annotation.Bean;
import org.springframework.resilience.annotation.EnableResilientMethods;
import org.springframework.scheduling.annotation.EnableScheduling;

import com.fuelinsights.ingestion.MinistryTls;

@SpringBootApplication
@ConfigurationPropertiesScan
@EnableResilientMethods
@EnableScheduling
public class FuelInsightsApplication {

	public static void main(String[] args) {
		MinistryTls.allowRsaKeyExchange();
		SpringApplication.run(FuelInsightsApplication.class, args);
	}

	/** "Today" means today in Spain, wherever the server runs (containers usually run in UTC). */
	@Bean
	Clock clock() {
		return Clock.system(ZoneId.of("Europe/Madrid"));
	}

}
