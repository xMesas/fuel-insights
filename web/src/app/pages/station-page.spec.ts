import { provideHttpClient } from '@angular/common/http';
import { signedOutAccount } from '../account-fixture';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RESPONSE_INIT } from '@angular/core';
import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { StationPage } from './station-page';
import { stationDetail, stationPage } from './page-fixture';
import { SITE_ORIGIN } from '../seo';
import { jsonLd, stationId } from './page-tools';

describe('StationPage', () => {
	let http: HttpTestingController;
	let response: ResponseInit;
	beforeEach(() => {
		localStorage.clear();
		response = {};
		TestBed.configureTestingModule({
			deferBlockBehavior: DeferBlockBehavior.Manual,
			providers: [
				signedOutAccount(),
				provideHttpClient(),
				provideHttpClientTesting(),
				provideRouter([]),
				{ provide: RESPONSE_INIT, useValue: response },
				{ provide: SITE_ORIGIN, useValue: 'https://fuel.example' },
				{
					provide: ActivatedRoute,
					useValue: { paramMap: of(convertToParamMap({ station: '4375-old-slug' })) },
				},
			],
		});
		http = TestBed.inject(HttpTestingController);
	});
	afterEach(() => http.verify());
	it('reads the leading integer from a station slug', () => {
		expect(stationId('4375-repsol-albacete')).toBe(4375);
		expect(stationId('4375')).toBe(4375);
	});
	it('rejects invalid station identifiers', () => {
		for (const value of ['repsol', '0', '-1', '4375x', '9007199254740992'])
			expect(stationId(value)).toBeNull();
	});
	async function create(name = stationDetail.name) {
		const fixture = TestBed.createComponent(StationPage);
		http.expectOne('/api/pages/stations/4375').flush(stationPage);
		http.expectOne('/api/stations/4375').flush({ ...stationDetail, name });
		await fixture.whenStable();
		return fixture;
	}
	it('renders station prices address hours and nearby stations', async () => {
		const fixture = await create();
		const text = fixture.nativeElement.textContent;
		expect(fixture.nativeElement.querySelector('h1').textContent).toBe('REPSOL en Sabadell');
		expect(text).toContain(stationDetail.address);
		expect(text).toContain('1,829 €/l');
		expect(text).toContain('PLENOIL');
		expect(text).toContain('1,3 km');
		expect(text).toContain('29 oct 2026, 22:00');
		expect(fixture.nativeElement.querySelector('a[href="/?gasolinera=4375"]')).not.toBeNull();
	});
	it('uses the API slug as canonical regardless of the requested slug', async () => {
		await create();
		expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
			'https://fuel.example/gasolinera/4375-repsol-sabadell',
		);
	});
	it('renders GasStation and breadcrumbs JSON-LD with escaped markup', async () => {
		await create('REPSOL </script><script>unsafe</script>');
		const raw = document.querySelector('#page-jsonld')!.textContent!;
		expect(raw).not.toContain('<');
		expect(raw).toContain('\\u003c/script>');
		const [station, breadcrumbs] = JSON.parse(raw);
		expect(station['@type']).toBe('GasStation');
		expect(station.address.addressCountry).toBe('ES');
		expect(station.address.addressLocality).toBe('Sabadell');
		expect(station.geo.latitude).toBe(stationDetail.latitude);
		expect(breadcrumbs.itemListElement.map((item: { name: string }) => item.name)).toEqual([
			'Inicio',
			'Barcelona',
			'Sabadell',
			station.name,
		]);
	});
	it('removes structured data when the page is destroyed', async () => {
		const fixture = await create();
		fixture.destroy();
		expect(document.querySelector('#page-jsonld')).toBeNull();
	});
	it('renders a 404 when the station does not exist', async () => {
		const fixture = TestBed.createComponent(StationPage);
		http.expectOne('/api/pages/stations/4375').flush({}, { status: 404, statusText: 'Not Found' });
		http.match('/api/stations/4375');
		await fixture.whenStable();
		expect(response.status).toBe(404);
		expect(fixture.nativeElement.querySelector('h1').textContent).toContain('No encontramos');
	});
	it('escapes less than signs without changing JSON data', () => {
		const value = { name: '<station>' };
		expect(JSON.parse(jsonLd(value))).toEqual(value);
		expect(jsonLd(value)).not.toContain('<');
	});
});
