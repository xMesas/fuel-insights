package com.fuelinsights;

import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.health.actuate.endpoint.HealthEndpointGroups;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

import static org.assertj.core.api.Assertions.assertThat;

/** What production relies on: health probes on the main port and no import API when it is disabled. */
@SpringBootTest(properties = { "fuel-insights.import.cron=-", "fuel-insights.import.api-enabled=false" })
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class OperationsIntegrationTest {

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private HealthEndpointGroups healthGroups;

	@Test
	void readinessDependsOnTheDatabase() {
		assertThat(this.healthGroups.get("readiness").isMember("db")).isTrue();
	}

	@Test
	void livenessDoesNotDependOnTheDatabase() {
		assertThat(this.healthGroups.get("liveness").isMember("db")).isFalse();
	}

	@Test
	void probesAnswerOnTheMainPort() {
		assertThat(this.mvc.get().uri("/readyz")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("UP");
		assertThat(this.mvc.get().uri("/livez")).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("UP");
	}

	@Test
	void importApiDoesNotExistWhenDisabled() {
		assertThat(this.mvc.post().uri("/api/imports?date=2026-10-27")).hasStatus(404);
		assertThat(this.mvc.get().uri("/api/imports?from=2026-10-01&to=2026-10-27")).hasStatus(404);
	}

}
