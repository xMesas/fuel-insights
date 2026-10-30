package com.fuelinsights.accounts;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

import com.fuelinsights.accounts.AccountRepository.DueAlert;
import com.fuelinsights.prices.Fuel;
import com.fuelinsights.shared.PlaceName;
import com.fuelinsights.shared.SiteProperties;

/** The two emails the site sends, in Spanish, as plain text with a simple HTML twin. */
@Component
class Mailer {

	private static final Locale SPANISH = Locale.forLanguageTag("es-ES");

	private static final DateTimeFormatter MINISTRY_TIME = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", SPANISH)
		.withZone(ZoneId.of("Europe/Madrid"));

	private final JavaMailSender sender;

	private final AccountsProperties properties;

	private final SiteProperties site;

	private final UnsubscribeLinks unsubscribe;

	Mailer(JavaMailSender sender, AccountsProperties properties, SiteProperties site, UnsubscribeLinks unsubscribe) {
		this.sender = sender;
		this.properties = properties;
		this.site = site;
		this.unsubscribe = unsubscribe;
	}

	void sendSignInLink(String email, String token) {
		String link = this.site.link("/entrar/confirmar?token=" + token);
		long minutes = this.properties.linkLifetime().toMinutes();
		String text = """
				Hola:

				Para entrar en fuel-insights, abre este enlace en los próximos %d minutos:
				%s

				Si no lo has pedido tú, ignora este email: nadie puede entrar sin el enlace.
				""".formatted(minutes, link);
		String html = """
				<p>Hola:</p>
				<p>Para entrar en fuel-insights, abre este enlace en los próximos %d minutos:</p>
				<p><a href="%s">Entrar en fuel-insights</a></p>
				<p>Si no lo has pedido tú, ignora este email: nadie puede entrar sin el enlace.</p>
				""".formatted(minutes, HtmlUtils.htmlEscape(link));
		send(email, "Tu enlace para entrar en fuel-insights", text, html, null);
	}

	void sendAlert(DueAlert alert, Instant publishedAt) {
		Fuel fuel = Fuel.valueOf(alert.fuel());
		String unit = fuel.unit().symbol();
		String town = (alert.municipality() != null) ? PlaceName.display(alert.municipality()) : "";
		String where = town.isEmpty() ? alert.stationName() : alert.stationName() + ", " + town;
		String signature = this.unsubscribe.signature(alert.id());
		String stationLink = this.site.link("/gasolinera/" + alert.stationId());
		String stopPage = this.site.link("/alertas/baja?alerta=" + alert.id() + "&firma=" + signature);
		String oneClick = this.site.link("/api/alerts/unsubscribe?alert=" + alert.id() + "&signature=" + signature);
		String text = """
				%s vende %s a %s €/%s, por debajo de tu aviso de %s €/%s.
				Precios del Ministerio del %s.

				Ver la gasolinera: %s

				No recibirás otro aviso de esta alerta hasta mañana.
				Para dejar de recibirla: %s
				""".formatted(where, fuel.displayName(), price(alert.price()), unit, price(alert.threshold()), unit,
				MINISTRY_TIME.format(publishedAt), stationLink, stopPage);
		String html = """
				<p><strong>%s</strong> vende %s a <strong>%s €/%s</strong>, por debajo de tu aviso de %s €/%s.<br>
				Precios del Ministerio del %s.</p>
				<p><a href="%s">Ver la gasolinera</a></p>
				<p>No recibirás otro aviso de esta alerta hasta mañana.
				<a href="%s">Dejar de recibirla</a>.</p>
				""".formatted(HtmlUtils.htmlEscape(where), fuel.displayName(), price(alert.price()), unit,
				price(alert.threshold()), unit, MINISTRY_TIME.format(publishedAt), HtmlUtils.htmlEscape(stationLink),
				HtmlUtils.htmlEscape(stopPage));
		String subject = "%s a %s €/%s en %s".formatted(fuel.displayName(), price(alert.price()), unit, where);
		send(alert.email(), subject, text, html, oneClick);
	}

	private void send(String to, String subject, String text, String html, String oneClickUnsubscribe) {
		try {
			MimeMessage message = this.sender.createMimeMessage();
			MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
			helper.setFrom(this.properties.mailFrom());
			helper.setTo(to);
			helper.setSubject(subject);
			helper.setText(text, html);
			if (oneClickUnsubscribe != null) {
				// RFC 8058: mail clients show their own "unsubscribe" button and POST to this address.
				message.setHeader("List-Unsubscribe", "<" + oneClickUnsubscribe + ">");
				message.setHeader("List-Unsubscribe-Post", "List-Unsubscribe=One-Click");
			}
			this.sender.send(message);
		}
		catch (MessagingException ex) {
			throw new MailSendException("Could not build the email to " + to, ex);
		}
	}

	private static String price(BigDecimal price) {
		return String.format(SPANISH, "%.3f", price);
	}

}
