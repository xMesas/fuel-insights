package com.fuelinsights.accounts;

import java.util.function.Supplier;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.CsrfTokenRequestHandler;
import org.springframework.security.web.csrf.XorCsrfTokenRequestAttributeHandler;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.util.StringUtils;

/**
 * Spring Security's single-page-app CSRF handling ({@code csrf.spa()}), except where the token cookie is written:
 * {@code spa()} writes it on every answer, and a {@code Set-Cookie} makes the public, cacheable answers uncacheable
 * (nginx, CDNs and Angular's transfer cache all refuse them, and rightly: a shared cache must not hand one cookie to
 * everyone). Here only the account API writes it, which the web calls before its first POST.
 */
final class AccountsCsrfTokenRequestHandler implements CsrfTokenRequestHandler {

	private static final RequestMatcher ACCOUNT_API = new OrRequestMatcher(
			PathPatternRequestMatcher.withDefaults().matcher("/api/me"),
			PathPatternRequestMatcher.withDefaults().matcher("/api/me/**"),
			PathPatternRequestMatcher.withDefaults().matcher("/api/auth/**"));

	private final CsrfTokenRequestAttributeHandler plain = new CsrfTokenRequestAttributeHandler();

	private final CsrfTokenRequestAttributeHandler xor = new XorCsrfTokenRequestAttributeHandler();

	@Override
	public void handle(HttpServletRequest request, HttpServletResponse response, Supplier<CsrfToken> csrfToken) {
		this.xor.handle(request, response, csrfToken);
		if (ACCOUNT_API.matches(request)) {
			// Loading the deferred token is what writes the XSRF-TOKEN cookie.
			csrfToken.get();
		}
	}

	// The web sends the raw cookie value in the header (plain); a form field would carry the masked one (xor).
	@Override
	public String resolveCsrfTokenValue(HttpServletRequest request, CsrfToken csrfToken) {
		String header = request.getHeader(csrfToken.getHeaderName());
		return (StringUtils.hasText(header) ? this.plain : this.xor).resolveCsrfTokenValue(request, csrfToken);
	}

}
