package com.fuelinsights.accounts;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import com.fuelinsights.TestcontainersConfiguration;
import com.fuelinsights.prices.CurrentPricesUpdated;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

/** Accounts against a real PostgreSQL and the real security filters; only the mail server is faked. */
@SpringBootTest(properties = { "fuel-insights.import.cron=-", "fuel-insights.site.origin=https://example.es" })
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AccountsIntegrationTest {

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private ApplicationEventPublisher events;

	@Autowired
	private UnsubscribeLinks unsubscribe;

	@MockitoBean
	private JavaMailSender mail;

	@BeforeEach
	void twoStations() {
		this.jdbc.sql("""
				truncate app_user, one_time_tokens, spring_session, price_current, station_current, current_snapshot,
					import_day, price_stats_daily, price_daily, station, province cascade
				""").update();
		this.jdbc.sql("insert into province (id, name) values ('08', 'BARCELONA')").update();
		this.jdbc.sql("""
				insert into station (id, brand_raw, brand, municipality, province_id, latitude, longitude, first_seen,
					last_seen)
				values (1, 'REPSOL', 'REPSOL', 'Sabadell', '08', 41.54, 2.11, date '2026-01-01', date '2026-10-28'),
					(2, 'BP', 'BP', 'Terrassa', '08', 41.56, 2.01, date '2026-01-01', date '2026-10-28')
				""").update();
		this.jdbc.sql("""
				insert into price_current (station_id, fuel, price)
				values (1, 'GASOLEO_A', 1.859), (1, 'GASOLINA_95_E5', 1.759), (2, 'GASOLEO_A', 1.899)
				""").update();
		given(this.mail.createMimeMessage()).willAnswer((invocation) -> new MimeMessage((Session) null));
	}

	@Test
	void linkIsEmailedToTheAddressInLowerCase() throws Exception {
		assertThat(requestLink(" Ana@Example.ES ")).hasStatus(HttpStatus.ACCEPTED);

		MimeMessage sent = sentMessages(1).getFirst();
		assertThat(sent.getRecipients(Message.RecipientType.TO)[0].toString()).isEqualTo("ana@example.es");
		assertThat(sent.getSubject()).isEqualTo("Tu enlace para entrar en fuel-insights");
	}

	@Test
	void addressThatCannotBeOneIsRejected() {
		assertThat(requestLink("ana@")).hasStatus(HttpStatus.BAD_REQUEST);

		verify(this.mail, never()).send(any(MimeMessage.class));
	}

	@Test
	void linkIsNotSentWithoutTheCsrfToken() {
		assertThat(this.mvc.post().uri("/api/auth/link").param("email", "ana@example.es"))
			.hasStatus(HttpStatus.FORBIDDEN);

		verify(this.mail, never()).send(any(MimeMessage.class));
	}

	@Test
	void onlyThreeLinksAreSentToOneAddressWhileTheyAreValid() {
		for (int i = 0; i < 4; i++) {
			assertThat(requestLink("ana@example.es")).hasStatus(HttpStatus.ACCEPTED);
		}

		verify(this.mail, times(3)).send(any(MimeMessage.class));
	}

	@Test
	void linkSignsInOnceAndStartsTheAccount() {
		requestLink("ana@example.es");
		String token = token("ana@example.es");

		MvcTestResult login = login(token);

		assertThat(login).hasStatus(HttpStatus.NO_CONTENT);
		assertThat(this.mvc.get().uri("/api/me").cookie(session(login))).hasStatusOk()
			.bodyJson()
			.isLenientlyEqualTo("""
					{"email": "ana@example.es", "premium": false, "alertLimit": 3}
					""");
		assertThat(this.jdbc.sql("select count(*) from app_user where last_login_at is not null")
			.query(Integer.class)
			.single()).isOne();
		assertThat(login(token)).hasStatus(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void nobodyIsSignedInWithoutALink() {
		assertThat(this.mvc.get().uri("/api/me")).hasStatus(HttpStatus.NO_CONTENT);
		assertThat(this.mvc.get().uri("/api/me/favourites")).hasStatus(HttpStatus.UNAUTHORIZED);
		assertThat(this.mvc.delete().uri("/api/me").with(csrf())).hasStatus(HttpStatus.UNAUTHORIZED);
		assertThat(login("00000000-0000-0000-0000-000000000000")).hasStatus(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void favouritesKeepStationsWithTheirCurrentPrices() {
		Cookie ana = signIn("ana@example.es");

		assertThat(this.mvc.put().uri("/api/me/favourites/1").cookie(ana).with(csrf()))
			.hasStatus(HttpStatus.NO_CONTENT);
		assertThat(this.mvc.put().uri("/api/me/favourites/999").cookie(ana).with(csrf()))
			.hasStatus(HttpStatus.NOT_FOUND);

		assertThat(this.mvc.get().uri("/api/me/favourites").cookie(ana)).bodyJson().isLenientlyEqualTo("""
				[{"id": 1, "name": "REPSOL", "town": "Sabadell",
				  "prices": {"GASOLEO_A": 1.859, "GASOLINA_95_E5": 1.759}}]
				""");
		this.mvc.delete().uri("/api/me/favourites/1").cookie(ana).with(csrf()).exchange();
		assertThat(this.mvc.get().uri("/api/me/favourites").cookie(ana)).bodyJson().isEqualTo("[]");
	}

	@Test
	void freeAccountKeepsThreeAlertsAndCanChangeThem() {
		Cookie ana = signIn("ana@example.es");

		assertThat(saveAlert(ana, 1, "GASOLEO_A", "1.800")).hasStatus(HttpStatus.CREATED);
		assertThat(saveAlert(ana, 1, "GASOLINA_95_E5", "1.700")).hasStatus(HttpStatus.CREATED);
		assertThat(saveAlert(ana, 2, "GASOLEO_A", "1.850")).hasStatus(HttpStatus.CREATED);
		assertThat(saveAlert(ana, 2, "GASOLINA_95_E5", "1.700")).hasStatus(HttpStatus.CONFLICT);
		assertThat(saveAlert(ana, 1, "GASOLEO_A", "1.750")).hasStatus(HttpStatus.OK)
			.bodyJson()
			.isLenientlyEqualTo("""
					{"stationId": 1, "stationName": "REPSOL", "town": "Sabadell", "fuel": "GASOLEO_A",
					 "threshold": 1.750, "currentPrice": 1.859}
					""");
	}

	@Test
	void nobodyDeletesSomeoneElsesAlert() throws Exception {
		Cookie ana = signIn("ana@example.es");
		long alert = alertId(saveAlert(ana, 1, "GASOLEO_A", "1.800"));
		Cookie bea = signIn("bea@example.es");

		assertThat(this.mvc.delete().uri("/api/me/alerts/" + alert).cookie(bea).with(csrf()))
			.hasStatus(HttpStatus.NOT_FOUND);
		assertThat(this.mvc.delete().uri("/api/me/alerts/" + alert).cookie(ana).with(csrf()))
			.hasStatus(HttpStatus.NO_CONTENT);
	}

	@Test
	void alertIsEmailedOnceADayWhileThePriceIsAtOrBelowIt() throws Exception {
		Cookie ana = signIn("ana@example.es");
		saveAlert(ana, 1, "GASOLEO_A", "1.900");
		saveAlert(ana, 2, "GASOLEO_A", "1.800");

		this.events.publishEvent(new CurrentPricesUpdated(Instant.parse("2026-10-29T21:00:00Z")));
		this.events.publishEvent(new CurrentPricesUpdated(Instant.parse("2026-10-29T21:15:00Z")));

		// The sign-in link, then one alert: station 2 sells at 1,899, above its 1,800.
		MimeMessage alert = sentMessages(2).get(1);
		assertThat(alert.getSubject()).isEqualTo("Gasóleo A a 1,859 €/l en REPSOL, Sabadell");
		assertThat(alert.getHeader("List-Unsubscribe")[0]).startsWith("<https://example.es/api/alerts/unsubscribe?");
		assertThat(alert.getHeader("List-Unsubscribe-Post")[0]).isEqualTo("List-Unsubscribe=One-Click");
	}

	@Test
	void signedLinkStopsTheAlertWithoutSigningIn() throws Exception {
		Cookie ana = signIn("ana@example.es");
		long alert = alertId(saveAlert(ana, 1, "GASOLEO_A", "1.900"));

		assertThat(this.mvc.post()
			.uri("/api/alerts/unsubscribe?alert={id}&signature={signature}", alert, "forged"))
			.hasStatus(HttpStatus.NOT_FOUND);
		assertThat(this.mvc.post()
			.uri("/api/alerts/unsubscribe?alert={id}&signature={signature}", alert, this.unsubscribe.signature(alert)))
			.hasStatus(HttpStatus.NO_CONTENT);
		assertThat(this.jdbc.sql("select count(*) from price_alert").query(Integer.class).single()).isZero();
	}

	@Test
	void deletingTheAccountRemovesEverythingAndSignsOut() {
		Cookie ana = signIn("ana@example.es");
		this.mvc.put().uri("/api/me/favourites/1").cookie(ana).with(csrf()).exchange();
		saveAlert(ana, 1, "GASOLEO_A", "1.900");

		assertThat(this.mvc.delete().uri("/api/me").cookie(ana).with(csrf())).hasStatus(HttpStatus.NO_CONTENT);

		assertThat(this.mvc.get().uri("/api/me").cookie(ana)).hasStatus(HttpStatus.NO_CONTENT);
		assertThat(this.jdbc.sql("""
				select (select count(*) from app_user) + (select count(*) from favourite_station)
					+ (select count(*) from price_alert)
				""").query(Integer.class).single()).isZero();
	}

	@Test
	void deletingTheAccountSignsItOutOnEveryDevice() {
		Cookie phone = signIn("ana@example.es");
		Cookie laptop = signIn("ana@example.es");

		this.mvc.delete().uri("/api/me").cookie(phone).with(csrf()).exchange();
		// The same email signs up again: the old sessions must not open the new account.
		signIn("ana@example.es");

		assertThat(this.mvc.get().uri("/api/me").cookie(laptop)).hasStatus(HttpStatus.NO_CONTENT);
	}

	@Test
	void publicAnswersKeepTheirOwnCacheRules() {
		assertThat(this.mvc.get().uri("/api/pages/provinces")).hasStatusOk()
			.hasHeader(HttpHeaders.CACHE_CONTROL, "max-age=86400, public");
	}

	// A Set-Cookie would make them uncacheable for nginx, CDNs and Angular's transfer cache.
	@Test
	void publicAnswersSetNoCookie() {
		assertThat(this.mvc.get().uri("/api/pages/provinces")).doesNotContainHeader(HttpHeaders.SET_COOKIE);
	}

	private MvcTestResult requestLink(String email) {
		return this.mvc.post()
			.uri("/api/auth/link")
			.contentType(MediaType.APPLICATION_FORM_URLENCODED)
			.param("email", email)
			.with(csrf())
			.exchange();
	}

	private MvcTestResult login(String token) {
		return this.mvc.post()
			.uri("/api/auth/login")
			.contentType(MediaType.APPLICATION_FORM_URLENCODED)
			.param("token", token)
			.with(csrf())
			.exchange();
	}

	private Cookie signIn(String email) {
		requestLink(email);
		return session(login(token(email)));
	}

	private String token(String email) {
		return this.jdbc.sql("select token_value from one_time_tokens where username = :email")
			.param("email", email)
			.query(String.class)
			.single();
	}

	private static Cookie session(MvcTestResult login) {
		Cookie session = login.getResponse().getCookie("SESSION");
		assertThat(session).as("session cookie").isNotNull();
		return session;
	}

	private MvcTestResult saveAlert(Cookie user, int station, String fuel, String threshold) {
		return this.mvc.post()
			.uri("/api/me/alerts")
			.cookie(user)
			.with(csrf())
			.contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"stationId": %d, "fuel": "%s", "threshold": %s}
					""".formatted(station, fuel, new BigDecimal(threshold)))
			.exchange();
	}

	private static long alertId(MvcTestResult saved) throws Exception {
		return Long.parseLong(saved.getResponse().getContentAsString().replaceAll(".*\"id\":(\\d+).*", "$1").trim());
	}

	private List<MimeMessage> sentMessages(int expected) {
		ArgumentCaptor<MimeMessage> messages = ArgumentCaptor.forClass(MimeMessage.class);
		verify(this.mail, times(expected)).send(messages.capture());
		return messages.getAllValues();
	}

}
