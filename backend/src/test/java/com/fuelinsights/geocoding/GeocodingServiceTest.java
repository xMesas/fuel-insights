package com.fuelinsights.geocoding;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.client.RestClient;

import com.fuelinsights.geocoding.GeocodingService.GeoPlace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** CartoCiudad answers faked with its real shapes (29 Oct 2026). */
class GeocodingServiceTest {

	private MockRestServiceServer cartoCiudad;

	private GeocodingService geocoding;

	@BeforeEach
	void fakeCartoCiudad() {
		RestClient.Builder builder = RestClient.builder().baseUrl("https://geocoder.test");
		this.cartoCiudad = MockRestServiceServer.bindTo(builder).build();
		this.geocoding = new GeocodingService(new CartoCiudadClient(builder.build()));
	}

	@Test
	void streetNumberComesWithItsPointAndAReadableName() {
		this.cartoCiudad.expect(requestTo(startsWith("https://geocoder.test/candidates")))
			.andExpect(queryParam("q", "calle%20portugal%2055%20mollet"))
			.andRespond(withSuccess("""
					[{"id": "09.08.MUN_081240525039", "type": "portal", "address": "CALLE PORTUGAL 55, Mollet del Vallès",
					  "muni": "Mollet del Vallès", "province": "Barcelona", "lat": 41.5408713, "lng": 2.2148464},
					 {"id": "x", "type": "Codpost", "address": "08100", "lat": 0, "lng": 0}]
					""", MediaType.APPLICATION_JSON));

		assertThat(this.geocoding.search("  Calle Portugal   55 Mollet ")).containsExactly(
				new GeoPlace("09.08.MUN_081240525039", "portal", "Dirección", "Calle Portugal 55, Mollet del Vallès",
						"Mollet del Vallès", "Barcelona", 41.5408713, 2.2148464));
	}

	@Test
	void addressesComeBeforeStreetsTownsAndPlaces() {
		this.cartoCiudad.expect(requestTo(startsWith("https://geocoder.test/candidates")))
			.andRespond(withSuccess("""
					[{"id": "1", "type": "toponimo", "address": "AEROPUERTO T4, Madrid", "lat": 40.49, "lng": -3.59},
					 {"id": "2", "type": "Municipio", "address": "Madrid, Madrid", "lat": 0, "lng": 0},
					 {"id": "3", "type": "callejero", "address": "CALLE DE ALCALÁ, Madrid", "lat": 0, "lng": 0}]
					""", MediaType.APPLICATION_JSON));

		assertThat(this.geocoding.search("madrid")).extracting(GeoPlace::kind, GeoPlace::label, GeoPlace::latitude)
			.containsExactly(tuple("Calle", "Calle de Alcalá, Madrid", null),
					tuple("Municipio", "Madrid, Madrid", null),
					tuple("Lugar", "Aeropuerto T4, Madrid", 40.49));
	}

	@Test
	void sameSearchIsAskedOnce() {
		this.cartoCiudad.expect(requestTo(startsWith("https://geocoder.test/candidates")))
			.andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));

		this.geocoding.search("Mollet");
		this.geocoding.search("mollet ");

		this.cartoCiudad.verify();
	}

	@Test
	void townWithoutPointIsPlacedOnDemand() {
		this.cartoCiudad.expect(requestTo(startsWith("https://geocoder.test/find")))
			.andExpect(queryParam("type", "Municipio"))
			.andRespond(withSuccess("""
					{"id": "08124", "type": "Municipio", "address": "Mollet del Vallès", "muni": "Mollet del Vallès",
					 "lat": 41.549, "lng": 2.2097}
					""", MediaType.APPLICATION_JSON));

		assertThat(this.geocoding.point("08124", "Municipio")).map(GeoPlace::latitude).contains(41.549);
	}

	@Test
	void geocoderDownIsAServiceUnavailableAnswer() {
		this.cartoCiudad.expect(requestTo(startsWith("https://geocoder.test/candidates")))
			.andRespond(withServerError());

		assertThatThrownBy(() -> this.geocoding.search("mollet")).isInstanceOf(ErrorResponseException.class)
			.extracting((ex) -> ((ErrorResponseException) ex).getStatusCode())
			.isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
	}

	@Test
	void capitalsReadAsPeopleWriteThemAndMixedCaseIsKept() {
		assertThat(GeocodingService.label("AVENIDA DE LES CORTS CATALANES 682, Barcelona"))
			.isEqualTo("Avenida de les Corts Catalanes 682, Barcelona");
		assertThat(GeocodingService.label("CARRER D'ARAGÓ 1, l'Hospitalet de Llobregat"))
			.isEqualTo("Carrer d'Aragó 1, l'Hospitalet de Llobregat");
	}

}
