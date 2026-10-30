import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RESPONSE_INIT } from '@angular/core';
import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { FuelPage } from './fuel-page';
import { ProvincePage } from './province-page';
import { TownPage } from './town-page';
import { fuelPage, provinceLinks, provincePage, townPage } from './page-fixture';
import { liveFuels } from '../live-fixture';
import { sampleTrend } from '../trend-fixture';

describe('Price pages', () => {
	let http: HttpTestingController;
	let response: ResponseInit;
	let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
	let routeData: BehaviorSubject<{ fuel: string }>;
	beforeEach(() => {
		localStorage.clear();
		response = {};
		params = new BehaviorSubject(convertToParamMap({ province: 'barcelona', town: 'sabadell' }));
		routeData = new BehaviorSubject({ fuel: 'GASOLEO_A' });
		TestBed.configureTestingModule({
			deferBlockBehavior: DeferBlockBehavior.Manual,
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				provideRouter([]),
				{ provide: RESPONSE_INIT, useValue: response },
				{
					provide: ActivatedRoute,
					useValue: { paramMap: params, data: routeData },
				},
			],
		});
		http = TestBed.inject(HttpTestingController);
	});
	afterEach(() => http.verify());
	it('returns 404 for a missing town', async () => {
		const fixture = TestBed.createComponent(TownPage);
		http.expectOne('/api/fuels').flush(liveFuels);
		http
			.expectOne('/api/pages/provinces/barcelona/sabadell')
			.flush({}, { status: 404, statusText: 'Not Found' });
		await fixture.whenStable();
		expect(response.status).toBe(404);
		expect(fixture.nativeElement.querySelector('h1').textContent).toContain('No encontramos');
	});
	it('renders national prices and dated historical figures from the API', async () => {
		const fixture = TestBed.createComponent(FuelPage);
		http.expectOne('/api/pages/fuels/GASOLEO_A').flush(fuelPage);
		await fixture.whenStable();
		const text = fixture.nativeElement.textContent;
		expect(text).toContain('Precio del diésel hoy, 29 de octubre de 2026');
		expect(text).toContain('1,898 €/l');
		expect(text).toContain('27 oct 2026');
		expect(text).toContain('21 mar 2026');
		expect(text).toContain('22:00');
		expect(
			fixture.nativeElement.querySelector('a[href="/gasolinera/4375-repsol-sabadell"]'),
		).not.toBeNull();
	});
	it('renders the petrol page using its own API fuel', async () => {
		routeData.next({ fuel: 'GASOLINA_95_E5' });
		const fixture = TestBed.createComponent(FuelPage);
		http.expectOne('/api/pages/fuels/GASOLINA_95_E5').flush({
			...fuelPage,
			fuel: { ...fuelPage.fuel, code: 'GASOLINA_95_E5', name: 'Gasolina 95 E5' },
		});
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('h1').textContent).toContain(
			'Precio de la gasolina hoy',
		);
		expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toContain(
			'/precio-gasolina-hoy',
		);
	});
	it('renders province prices and loads the trend using the catalogue id', async () => {
		const fixture = TestBed.createComponent(ProvincePage);
		http.expectOne('/api/fuels').flush(liveFuels);
		http.expectOne('/api/pages/provinces/barcelona').flush(provincePage);
		http.expectOne('/api/pages/provinces').flush(provinceLinks);
		await fixture.whenStable();
		http.expectOne('/api/stats/trend?fuel=GASOLEO_A&area=08').flush(sampleTrend);
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain(
			'3,2 céntimos menos que la media de España',
		);
		expect(
			fixture.nativeElement.querySelector('a[href="/gasolineras/barcelona/sabadell"]'),
		).not.toBeNull();
		const schema = JSON.parse(document.querySelector('#page-jsonld')!.textContent!);
		expect(schema['@type']).toBe('BreadcrumbList');
		expect(schema.itemListElement[1].name).toBe('Barcelona');
	});
	it('returns 404 content and status for a missing province without throwing', async () => {
		const fixture = TestBed.createComponent(ProvincePage);
		http.expectOne('/api/fuels').flush(liveFuels);
		http
			.expectOne('/api/pages/provinces/barcelona')
			.flush({}, { status: 404, statusText: 'Not Found' });
		// forkJoin cancels the catalogue when the page does not exist.
		http.match('/api/pages/provinces');
		await fixture.whenStable();
		expect(response.status).toBe(404);
		expect(fixture.nativeElement.querySelector('h1').textContent).toContain('No encontramos');
		expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
	});
	it('treats a temporary API failure as unavailable rather than missing', async () => {
		const fixture = TestBed.createComponent(TownPage);
		http.expectOne('/api/fuels').flush(liveFuels);
		http
			.expectOne('/api/pages/provinces/barcelona/sabadell')
			.flush({}, { status: 503, statusText: 'Unavailable' });
		await fixture.whenStable();
		expect(response.status).toBe(503);
		expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
			'No se han podido cargar',
		);
	});
	it('renders and sorts every town station by the selected fuel price', async () => {
		const fixture = TestBed.createComponent(TownPage);
		http.expectOne('/api/fuels').flush(liveFuels);
		http.expectOne('/api/pages/provinces/barcelona/sabadell').flush(townPage);
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Sabadell (Barcelona)');
		const links = () =>
			[...fixture.nativeElement.querySelectorAll('tbody a')].map((a: any) => a.textContent.trim());
		expect(links()).toEqual(['PLENOIL', 'REPSOL']);
		fixture.nativeElement.querySelector('th button').click();
		await fixture.whenStable();
		expect(links()).toEqual(['REPSOL', 'PLENOIL']);
		expect(fixture.nativeElement.textContent).toContain('Calle Uno 1');
		expect(fixture.nativeElement.textContent).toContain('3,2 céntimos menos');
	});
	it('keeps stations without the selected fuel at the end in either sort order', async () => {
		const fixture = TestBed.createComponent(TownPage);
		http.expectOne('/api/fuels').flush(liveFuels);
		http.expectOne('/api/pages/provinces/barcelona/sabadell').flush({
			...townPage,
			stations: [
				...townPage.stations,
				{ ...townPage.stations[0], id: 9999, name: 'GLP', prices: {} },
			],
		});
		await fixture.whenStable();
		expect(fixture.componentInstance.stations().at(-1)?.id).toBe(9999);
		fixture.componentInstance.ascending.set(false);
		expect(fixture.componentInstance.stations().at(-1)?.id).toBe(9999);
	});
	it('replaces town content when navigating between towns on the same route', async () => {
		const fixture = TestBed.createComponent(TownPage);
		http.expectOne('/api/fuels').flush(liveFuels);
		http.expectOne('/api/pages/provinces/barcelona/sabadell').flush(townPage);
		params.next(convertToParamMap({ province: 'barcelona', town: 'terrassa' }));
		http
			.expectOne('/api/pages/provinces/barcelona/terrassa')
			.flush({ ...townPage, town: { name: 'Terrassa', slug: 'terrassa' } });
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Terrassa');
	});
});
