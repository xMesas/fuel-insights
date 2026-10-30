package com.fuelinsights.premium;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HexFormat;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import com.fuelinsights.TestcontainersConfiguration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

/** The paid plan with Stripe's webhook signed as Stripe signs it; Stripe's pages (the gateway) are faked. */
@SpringBootTest(properties = { "fuel-insights.import.cron=-", "fuel-insights.premium.stripe-secret-key=sk_test_fake",
		"fuel-insights.premium.webhook-secret=" + PremiumIntegrationTest.WEBHOOK_SECRET,
		"fuel-insights.premium.price-id=price_test" })
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class PremiumIntegrationTest {

	static final String WEBHOOK_SECRET = "whsec_test_secret";

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JdbcClient jdbc;

	@MockitoBean
	private PaymentGateway gateway;

	@MockitoBean
	private JavaMailSender mail;

	private Cookie ana;

	private long anaId;

	private long created = 1_000;

	@BeforeEach
	void signedInAccount() {
		this.jdbc.sql("truncate app_user, one_time_tokens, spring_session, stripe_event, station, province cascade")
			.update();
		this.jdbc.sql("insert into province (id, name) values ('08', 'BARCELONA')").update();
		this.jdbc.sql("""
				insert into station (id, brand_raw, municipality, province_id, first_seen, last_seen)
				select g, 'REPSOL', 'Sabadell', '08', date '2026-01-01', date '2026-10-28' from generate_series(1, 4) g
				""").update();
		given(this.mail.createMimeMessage()).willAnswer((invocation) -> new MimeMessage((Session) null));
		this.mvc.post()
			.uri("/api/auth/link")
			.contentType(MediaType.APPLICATION_FORM_URLENCODED)
			.param("email", "ana@example.es")
			.with(csrf())
			.exchange();
		String token = this.jdbc.sql("select token_value from one_time_tokens").query(String.class).single();
		MvcTestResult login = this.mvc.post()
			.uri("/api/auth/login")
			.contentType(MediaType.APPLICATION_FORM_URLENCODED)
			.param("token", token)
			.with(csrf())
			.exchange();
		this.ana = login.getResponse().getCookie("SESSION");
		this.anaId = this.jdbc.sql("select id from app_user").query(Long.class).single();
	}

	@Test
	void signedSubscriptionEventMakesTheAccountPayingWithNoAlertLimit() throws Exception {
		assertThat(deliver(event("evt_1", "customer.subscription.created", "active", future())))
			.hasStatus(HttpStatus.NO_CONTENT);

		assertThat(this.mvc.get().uri("/api/me").cookie(this.ana)).bodyJson().isLenientlyEqualTo("""
				{"premium": true, "alertLimit": null}
				""");
		for (int station = 1; station <= 4; station++) {
			assertThat(this.mvc.post()
				.uri("/api/me/alerts")
				.cookie(this.ana)
				.with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"stationId\": %d, \"fuel\": \"GASOLEO_A\", \"threshold\": 1.8}".formatted(station)))
				.hasStatus(HttpStatus.CREATED);
		}
	}

	@Test
	void forgedSignatureChangesNothing() throws Exception {
		String payload = event("evt_1", "customer.subscription.created", "active", future());

		assertThat(this.mvc.post()
			.uri("/api/stripe/webhook")
			.header("Stripe-Signature", "t=" + Instant.now().getEpochSecond() + ",v1=" + "0".repeat(64))
			.contentType(MediaType.APPLICATION_JSON)
			.content(payload)).hasStatus(HttpStatus.BAD_REQUEST);

		assertThat(this.jdbc.sql("select count(*) from subscription").query(Integer.class).single()).isZero();
		assertThat(this.mvc.post().uri("/api/stripe/webhook").content(payload)).hasStatus(HttpStatus.BAD_REQUEST);
	}

	@Test
	void eventDeliveredAgainIsNotAppliedTwice() throws Exception {
		String created = event("evt_1", "customer.subscription.created", "active", future());
		deliver(created);
		deliver(event("evt_2", "customer.subscription.deleted", "canceled", future()));

		assertThat(deliver(created)).hasStatus(HttpStatus.NO_CONTENT);

		assertThat(this.jdbc.sql("select status from subscription").query(String.class).single()).isEqualTo("canceled");
	}

	@Test
	void cancelledOrEndedPlanIsNotPaying() throws Exception {
		deliver(event("evt_1", "customer.subscription.updated", "active", Instant.now().minusSeconds(60)));

		assertThat(this.mvc.get().uri("/api/me").cookie(this.ana)).bodyJson().isLenientlyEqualTo("""
				{"premium": false, "alertLimit": 3}
				""");
	}

	@Test
	void olderEventDeliveredLateNeverUndoesANewerOne() throws Exception {
		deliver(event("evt_2", "customer.subscription.deleted", "canceled", future(), 2_000, this.anaId));

		deliver(event("evt_1", "customer.subscription.updated", "active", future(), 1_000, this.anaId));

		assertThat(this.jdbc.sql("select status from subscription").query(String.class).single()).isEqualTo("canceled");
	}

	@Test
	void unpaidPlanIsCancelledWhenTheAccountIsDeleted() throws Exception {
		deliver(event("evt_1", "customer.subscription.updated", "past_due", Instant.now().minusSeconds(60)));

		this.mvc.delete().uri("/api/me").cookie(this.ana).with(csrf()).exchange();

		verify(this.gateway).cancel(eq("sub_1"));
	}

	@Test
	void planPaidForAnAccountDeletedMeanwhileIsCancelled() throws Exception {
		deliver(event("evt_1", "customer.subscription.created", "active", future(), 1_000, this.anaId + 999));

		verify(this.gateway).cancel(eq("sub_1"));
		assertThat(this.jdbc.sql("select count(*) from subscription").query(Integer.class).single()).isZero();
	}

	@Test
	void checkoutSendsTheBrowserToTheProvidersPageWithOneAttemptPerDay() {
		String attempt = "checkout-" + this.anaId + "-" + LocalDate.now(ZoneId.of("Europe/Madrid"));
		given(this.gateway.checkout(this.anaId, "ana@example.es", null, attempt))
			.willReturn("https://checkout.example/1");

		assertThat(this.mvc.post().uri("/api/me/premium/checkout").cookie(this.ana).with(csrf())).hasStatusOk()
			.bodyJson()
			.isLenientlyEqualTo("""
					{"url": "https://checkout.example/1"}
					""");
	}

	@Test
	void payingAccountCannotPayTwice() throws Exception {
		deliver(event("evt_1", "customer.subscription.created", "active", future()));

		assertThat(this.mvc.post().uri("/api/me/premium/checkout").cookie(this.ana).with(csrf()))
			.hasStatus(HttpStatus.CONFLICT);
	}

	@Test
	void deletingAPayingAccountCancelsItsPlanFirst() throws Exception {
		deliver(event("evt_1", "customer.subscription.created", "active", future()));

		assertThat(this.mvc.delete().uri("/api/me").cookie(this.ana).with(csrf())).hasStatus(HttpStatus.NO_CONTENT);

		verify(this.gateway).cancel(eq("sub_1"));
		assertThat(this.jdbc.sql("select count(*) from subscription").query(Integer.class).single()).isZero();
	}

	@Test
	void planIsOffWithoutTheStripeKeys() {
		assertThat(new PremiumProperties("sk_test_x", "", "price_x").enabled()).isFalse();
		assertThat(new PremiumProperties("sk_test_x", "whsec_x", "price_x").enabled()).isTrue();
	}

	private MvcTestResult deliver(String payload) throws Exception {
		long timestamp = Instant.now().getEpochSecond();
		Mac mac = Mac.getInstance("HmacSHA256");
		mac.init(new SecretKeySpec(WEBHOOK_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
		String signature = HexFormat.of()
			.formatHex(mac.doFinal((timestamp + "." + payload).getBytes(StandardCharsets.UTF_8)));
		return this.mvc.post()
			.uri("/api/stripe/webhook")
			.header("Stripe-Signature", "t=" + timestamp + ",v1=" + signature)
			.contentType(MediaType.APPLICATION_JSON)
			.content(payload)
			.exchange();
	}

	// Created in the order they are delivered, unless a test says otherwise.
	private String event(String id, String type, String status, Instant periodEnd) {
		return event(id, type, status, periodEnd, this.created++, this.anaId);
	}

	private String event(String id, String type, String status, Instant periodEnd, long created, long userId) {
		return """
				{"id": "%s", "object": "event", "type": "%s", "api_version": "2026-01-01", "created": %d,
				 "data": {"object": {"id": "sub_1", "object": "subscription", "customer": "cus_1", "status": "%s",
					"metadata": {"user_id": "%d"},
					"items": {"object": "list", "data": [{"id": "si_1", "current_period_end": %d}]}}}}
				""".formatted(id, type, created, status, userId, periodEnd.getEpochSecond());
	}

	private static Instant future() {
		return Instant.now().plusSeconds(30L * 24 * 3600);
	}

}
