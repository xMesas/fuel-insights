package com.fuelinsights.charging;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;

import javax.xml.stream.XMLStreamException;

import org.junit.jupiter.api.Test;

import org.springframework.core.io.ClassPathResource;

import com.fuelinsights.charging.ChargingFeedParser.ChargingFeed;
import com.fuelinsights.charging.ChargingSite.ChargingConnector;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

class ChargingFeedParserTest {

	@Test
	void feedKeepsItsPublicationTime() throws Exception {
		assertThat(sample().publishedAt()).isEqualTo(Instant.parse("2026-10-29T09:16:20.717Z"));
	}

	@Test
	void siteIsReadWithItsAddressOperatorAndHours() throws Exception {
		ChargingSite site = sample().sites().get(0);

		assertThat(site.id()).isEqualTo("2023002088");
		assertThat(site.name()).isEqualTo("Centro Porsche Baleares CP2");
		assertThat(site.operator()).isEqualTo("Motor Box Mallorca SL");
		assertThat(site.address()).isEqualTo("Camí dels Reis 166");
		assertThat(site.town()).isEqualTo("Palma");
		assertThat(site.province()).isEqualTo("Balears, Illes");
		assertThat(site.latitude()).isEqualByComparingTo("39.5948");
		assertThat(site.longitude()).isEqualByComparingTo("2.63586");
		assertThat(site.schedule()).startsWith("Miercoles (08:30 - 17:30)");
		assertThat(site.payment()).containsExactly("rfid", "apps");
		assertThat(site.updatedAt()).isEqualTo(Instant.parse("2023-11-21T10:39:04Z"));
	}

	@Test
	void fourDigitPostcodeGetsItsLeadingZero() throws Exception {
		assertThat(sample().sites()).extracting(ChargingSite::postcode).containsExactly("07011", "28901", null);
	}

	@Test
	void connectorsAreGroupedByTypeCurrentAndPower() throws Exception {
		ChargingSite site = sample().sites().get(1);

		assertThat(site.points()).isEqualTo(2);
		assertThat(site.connectors()).containsExactly(
				new ChargingConnector("iec62196T2COMBO", "DC", new BigDecimal("50.0"), 2),
				new ChargingConnector("chademo", "DC", new BigDecimal("50.0"), 1),
				new ChargingConnector("iec62196T2", "AC", new BigDecimal("22.0"), 2));
		assertThat(site.maxPowerKw()).isEqualByComparingTo("50");
	}

	@Test
	void emptyScheduleIsNoSchedule() throws Exception {
		assertThat(sample().sites().get(1).schedule()).isNull();
	}

	@Test
	void powerBelowOneKilowattIsLeftOut() throws Exception {
		ChargingSite site = sample().sites().get(2);

		assertThat(site.connectors()).isEmpty();
		assertThat(site.points()).isEqualTo(1);
		assertThat(site.maxPowerKw()).isNull();
	}

	@Test
	void externalEntityIsNeverResolved() {
		String attack = """
				<?xml version="1.0"?>
				<!DOCTYPE payload [<!ENTITY secret SYSTEM "file:///etc/passwd">]>
				<payload><publicationTime>&secret;</publicationTime></payload>
				""";

		assertThatExceptionOfType(XMLStreamException.class).isThrownBy(() -> ChargingFeedParser.parse(stream(attack)));
	}

	@Test
	void feedWithoutPublicationTimeIsRejected() {
		assertThatExceptionOfType(XMLStreamException.class)
			.isThrownBy(() -> ChargingFeedParser.parse(stream("<payload/>")));
	}

	private static ChargingFeed sample() throws Exception {
		try (InputStream input = new ClassPathResource("charging/feed-sample.xml").getInputStream()) {
			ChargingFeed feed = ChargingFeedParser.parse(input);
			assertThat(feed.sites()).hasSize(3);
			return feed;
		}
	}

	private static InputStream stream(String xml) {
		return new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8));
	}

	static List<ChargingSite> sampleSites() throws Exception {
		return sample().sites();
	}

}
