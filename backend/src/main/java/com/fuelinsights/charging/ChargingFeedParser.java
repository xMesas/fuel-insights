package com.fuelinsights.charging;

import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fuelinsights.charging.ChargingSite.ChargingConnector;

/**
 * Reads the DATEX II feed of charging sites (about 85 MB of XML) as a stream, one element at a time, so it never
 * holds the whole document in memory. Only the fields the web shows are kept.
 */
final class ChargingFeedParser {

	private static final Logger logger = LoggerFactory.getLogger(ChargingFeedParser.class);

	// No DTDs and no external entities: the feed is data from the network, and XXE is the classic XML attack.
	private static final XMLInputFactory FACTORY = XMLInputFactory.newFactory();

	static {
		FACTORY.setProperty(XMLInputFactory.SUPPORT_DTD, false);
		FACTORY.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
	}

	private static final Set<String> LEAVES = Set.of("value", "lastUpdated", "label", "postcode", "latitude",
			"longitude", "authenticationAndIdentificationMethods", "connectorType", "chargingMode", "maxPowerAtSocket");

	// A few connectors say 60 W: a typing error, not a charger. Leaving them out is better than guessing a unit.
	private static final BigDecimal MIN_POWER_KW = BigDecimal.ONE;

	private ChargingFeedParser() {
	}

	static ChargingFeed parse(InputStream input) throws XMLStreamException {
		XMLStreamReader xml = FACTORY.createXMLStreamReader(input, "UTF-8");
		try {
			Instant publishedAt = null;
			List<ChargingSite> sites = new ArrayList<>();
			Deque<String> path = new ArrayDeque<>();
			Site site = null;
			Connector connector = null;
			while (xml.hasNext()) {
				int event = xml.next();
				if (event == XMLStreamConstants.END_ELEMENT) {
					String name = path.pop();
					if (name.equals("energyInfrastructureSite") && site != null) {
						site.build().ifPresent(sites::add);
						site = null;
					}
					else if (name.equals("connector") && site != null && connector != null) {
						site.add(connector);
						connector = null;
					}
					continue;
				}
				if (event != XMLStreamConstants.START_ELEMENT) {
					continue;
				}
				String name = xml.getLocalName();
				if (site == null) {
					if (name.equals("publicationTime") && publishedAt == null) {
						publishedAt = OffsetDateTime.parse(xml.getElementText().trim()).toInstant();
						continue;
					}
					if (name.equals("energyInfrastructureSite")) {
						site = new Site(xml.getAttributeValue(null, "id"));
					}
					path.push(name);
					continue;
				}
				if (!LEAVES.contains(name)) {
					if (name.equals("refillPoint")) {
						site.points++;
					}
					else if (name.equals("connector")) {
						connector = new Connector();
					}
					path.push(name);
					continue;
				}
				// A leaf is read whole (getElementText moves to its end), so it never enters the path.
				String text = xml.getElementText().trim();
				switch (name) {
					case "value" -> site.value(path, text);
					case "lastUpdated" -> site.updatedAt = OffsetDateTime.parse(text).toInstant();
					case "label" -> site.schedule = text;
					case "postcode" -> site.postcode = text;
					case "latitude" -> site.latitude = new BigDecimal(text);
					case "longitude" -> site.longitude = new BigDecimal(text);
					case "authenticationAndIdentificationMethods" -> site.payment.add(text);
					default -> {
						if (connector != null) {
							connector.set(name, text);
						}
					}
				}
			}
			if (publishedAt == null) {
				throw new XMLStreamException("The feed has no publication time");
			}
			return new ChargingFeed(publishedAt, sites);
		}
		finally {
			xml.close();
		}
	}

	record ChargingFeed(Instant publishedAt, List<ChargingSite> sites) {
	}

	private static final class Connector {

		private String type;

		private String mode;

		private BigDecimal watts;

		void set(String field, String text) {
			switch (field) {
				case "connectorType" -> this.type = text;
				case "chargingMode" -> this.mode = text;
				case "maxPowerAtSocket" -> this.watts = new BigDecimal(text);
				default -> {
				}
			}
		}

	}

	private static final class Site {

		private final String id;

		private String name;

		private String operator;

		private String address;

		private String town;

		private String province;

		private String postcode;

		private BigDecimal latitude;

		private BigDecimal longitude;

		private String schedule;

		private final Set<String> payment = new LinkedHashSet<>();

		private int points;

		private final Map<ChargingConnector, Integer> connectors = new LinkedHashMap<>();

		private Instant updatedAt;

		Site(String id) {
			this.id = id;
		}

		// A text value means what its ancestors say: name > values > value is the site's name when the name hangs
		// from the site itself, and the operator's name when it hangs from the operator.
		void value(Deque<String> path, String text) {
			Iterator<String> ancestors = path.iterator();
			ancestors.next();
			String holder = ancestors.next();
			String owner = ancestors.next();
			if (holder.equals("name") && owner.equals("energyInfrastructureSite")) {
				this.name = text;
			}
			else if (holder.equals("name") && owner.equals("operator")) {
				this.operator = text;
			}
			else if (holder.equals("text") && owner.equals("addressLine")) {
				addressLine(text);
			}
		}

		// The feed writes the address as labelled lines: "Dirección: …", "Municipio: …", "Provincia: …".
		private void addressLine(String text) {
			int colon = text.indexOf(':');
			if (colon < 0) {
				return;
			}
			String value = text.substring(colon + 1).trim();
			switch (text.substring(0, colon).trim()) {
				case "Dirección" -> this.address = value;
				case "Municipio" -> this.town = value;
				case "Provincia" -> this.province = value;
				default -> {
				}
			}
		}

		void add(Connector connector) {
			if (connector.type == null || connector.watts == null) {
				return;
			}
			BigDecimal kw = connector.watts.divide(BigDecimal.valueOf(1000)).setScale(1, RoundingMode.HALF_UP);
			if (kw.compareTo(MIN_POWER_KW) < 0) {
				return;
			}
			String current = "mode4DC".equals(connector.mode) ? "DC" : "AC";
			this.connectors.merge(new ChargingConnector(connector.type, current, kw, 0), 1, Integer::sum);
		}

		Optional<ChargingSite> build() {
			if (this.id == null || this.latitude == null || this.longitude == null) {
				logger.warn("Skipping charging site {}: no position", this.id);
				return Optional.empty();
			}
			List<ChargingConnector> grouped = this.connectors.entrySet()
				.stream()
				.map((entry) -> new ChargingConnector(entry.getKey().type(), entry.getKey().current(),
						entry.getKey().powerKw(), entry.getValue()))
				.toList();
			return Optional.of(new ChargingSite(this.id, this.name, this.operator, this.address, this.town,
					this.province, postcode(this.postcode), this.latitude, this.longitude, emptyToNull(this.schedule),
					List.copyOf(this.payment), this.points, grouped, this.updatedAt));
		}

		// Postcodes are numbers in the source, so 07011 (Palma) arrives as 7011.
		private static String postcode(String raw) {
			if (raw == null || raw.isBlank()) {
				return null;
			}
			return (raw.length() == 4 && raw.chars().allMatch(Character::isDigit)) ? "0" + raw : raw;
		}

		private static String emptyToNull(String text) {
			return (text == null || text.isBlank()) ? null : text;
		}

	}

}
