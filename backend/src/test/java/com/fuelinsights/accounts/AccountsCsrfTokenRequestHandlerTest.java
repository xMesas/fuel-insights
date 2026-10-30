package com.fuelinsights.accounts;

import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.Test;

import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.csrf.DefaultCsrfToken;

import static org.assertj.core.api.Assertions.assertThat;

class AccountsCsrfTokenRequestHandlerTest {

	@Test
	void accountApiLoadsTheTokenSoItsCookieIsWritten() {
		assertThat(loadsToken("/api/me")).isTrue();
		assertThat(loadsToken("/api/auth/link")).isTrue();
	}

	@Test
	void publicApiLeavesTheTokenUnloaded() {
		assertThat(loadsToken("/api/pages/provinces")).isFalse();
	}

	private static boolean loadsToken(String path) {
		AtomicBoolean loaded = new AtomicBoolean();
		new AccountsCsrfTokenRequestHandler().handle(new MockHttpServletRequest("GET", path),
				new MockHttpServletResponse(), () -> {
					loaded.set(true);
					return new DefaultCsrfToken("X-XSRF-TOKEN", "_csrf", "token");
				});
		return loaded.get();
	}

}
