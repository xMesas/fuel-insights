package com.fuelinsights.accounts;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.ott.JdbcOneTimeTokenService;
import org.springframework.security.authentication.ott.OneTimeTokenService;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

/**
 * Everything stays public except {@code /api/me}. The session lives in a cookie (Spring Session in PostgreSQL), so
 * every request that changes something carries the CSRF token the web reads from the {@code XSRF-TOKEN} cookie,
 * which only the account API writes ({@link AccountsCsrfTokenRequestHandler}).
 */
@Configuration
class AccountsSecurity {

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, SignIn signIn, OneTimeTokenService tokens) {
		// GET /api/me answers everyone (204 when signed out), so a visitor's browser logs no 401 on every page.
		http.authorizeHttpRequests((requests) -> requests.requestMatchers(HttpMethod.GET, "/api/me")
			.permitAll()
			.requestMatchers("/api/me", "/api/me/**")
			.authenticated()
			.anyRequest()
			.permitAll())
			// The manual import (development only, called with curl), the one-click unsubscribe of mail clients and
			// Stripe's webhook (signed with its own secret) carry no cookie, so there is nothing to forge.
			.csrf((csrf) -> csrf.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
				.csrfTokenRequestHandler(new AccountsCsrfTokenRequestHandler())
				.ignoringRequestMatchers("/api/imports", "/api/imports/**", "/api/alerts/unsubscribe",
						"/api/stripe/webhook"))
			.oneTimeTokenLogin((login) -> login.tokenGeneratingUrl("/api/auth/link")
				.generateRequestResolver(signIn)
				.tokenGenerationSuccessHandler(signIn)
				.tokenService(tokens)
				.loginProcessingUrl("/api/auth/login")
				.loginPage("/entrar")
				.showDefaultSubmitPage(false)
				.authenticationSuccessHandler(signIn)
				.authenticationFailureHandler(
						(request, response, ex) -> response.sendError(HttpStatus.UNAUTHORIZED.value())))
			.logout((logout) -> logout.logoutUrl("/api/auth/logout")
				.logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
			.exceptionHandling((exceptions) -> exceptions
				.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
			.requestCache((cache) -> cache.disable())
			.formLogin(AbstractHttpConfigurer::disable)
			.httpBasic(AbstractHttpConfigurer::disable)
			.headers(Customizer.withDefaults());
		return http.build();
	}

	/** Tokens in PostgreSQL: a link keeps working across a restart, and expired ones are deleted every hour. */
	@Bean
	JdbcOneTimeTokenService oneTimeTokenService(JdbcTemplate jdbc) {
		return new JdbcOneTimeTokenService(jdbc);
	}

}
