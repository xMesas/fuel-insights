package com.fuelinsights.accounts;

import java.io.IOException;
import java.time.Clock;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.security.authentication.ott.GenerateOneTimeTokenRequest;
import org.springframework.security.authentication.ott.OneTimeToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.authentication.ott.GenerateOneTimeTokenRequestResolver;
import org.springframework.security.web.authentication.ott.OneTimeTokenGenerationSuccessHandler;
import org.springframework.stereotype.Component;

/**
 * Signing in with a link. {@code POST /api/auth/link} with {@code email} emails a one-time token; the link opens the
 * web, whose button sends the token to {@code POST /api/auth/login}. The extra click is on purpose: mail scanners that
 * open every link would otherwise use the token before the person does.
 */
@Component
class SignIn implements GenerateOneTimeTokenRequestResolver, OneTimeTokenGenerationSuccessHandler, UserDetailsService,
		AuthenticationSuccessHandler {

	private static final Logger logger = LoggerFactory.getLogger(SignIn.class);

	// The session table keeps the principal in 100 characters; real addresses are far shorter.
	private static final int MAX_EMAIL_LENGTH = 100;

	private static final Pattern EMAIL = Pattern.compile("[^@\\s]+@[^@\\s]+\\.[^@\\s.]+");

	private final AccountRepository accounts;

	private final Mailer mailer;

	private final AccountsProperties properties;

	private final Clock clock;

	SignIn(AccountRepository accounts, Mailer mailer, AccountsProperties properties, Clock clock) {
		this.accounts = accounts;
		this.mailer = mailer;
		this.properties = properties;
		this.clock = clock;
	}

	/** Trimmed and in lower case, or empty if it cannot be an address. */
	static Optional<String> normalise(String email) {
		if (email == null) {
			return Optional.empty();
		}
		String normalised = email.trim().toLowerCase(Locale.ROOT);
		return (normalised.length() <= MAX_EMAIL_LENGTH && EMAIL.matcher(normalised).matches())
				? Optional.of(normalised) : Optional.empty();
	}

	// A request without a valid address goes on to AuthController, which answers 400.
	@Override
	public GenerateOneTimeTokenRequest resolve(HttpServletRequest request) {
		return normalise(request.getParameter("email"))
			.map((email) -> new GenerateOneTimeTokenRequest(email, this.properties.linkLifetime()))
			.orElse(null);
	}

	/**
	 * Emails the link and answers 202 whether the address has an account or not, so the answer never tells who uses
	 * the site. Past a few links in a token's lifetime the email is not sent, so nobody can flood an inbox.
	 */
	@Override
	public void handle(HttpServletRequest request, HttpServletResponse response, OneTimeToken token)
			throws IOException {
		String email = token.getUsername();
		if (this.accounts.validLinks(email, this.clock.instant()) > this.properties.linksPerWindow()) {
			logger.info("Sign-in link not sent: too many requested for one address");
			response.setStatus(HttpStatus.ACCEPTED.value());
			return;
		}
		try {
			this.mailer.sendSignInLink(email, token.getTokenValue());
			response.setStatus(HttpStatus.ACCEPTED.value());
		}
		catch (MailException ex) {
			logger.warn("Sign-in link not sent: {}", ex.getMessage());
			response.sendError(HttpStatus.SERVICE_UNAVAILABLE.value());
		}
	}

	/** The account starts the first time its link is used, not when a link is asked for. */
	@Override
	public UserDetails loadUserByUsername(String email) {
		this.accounts.findOrCreate(email);
		return User.withUsername(email).password("").roles("USER").build();
	}

	@Override
	public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
			Authentication authentication) {
		this.accounts.signedIn(authentication.getName(), this.clock.instant());
		response.setStatus(HttpStatus.NO_CONTENT.value());
	}

}
