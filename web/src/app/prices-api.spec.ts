import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PricesApi } from './prices-api';
import { sampleStats } from './price-fixture';
import { sampleTrend } from './trend-fixture';
import { liveCurrent, liveSnapshot, liveStation } from './live-fixture';
import { PRICE_CACHE_LIFETIME, PRICE_CLOCK } from './price-clock';

describe('PricesApi', () => {
	let api: PricesApi;
	let http: HttpTestingController;
	let now: number;
	beforeEach(() => {
		now = 0;
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: PRICE_CLOCK, useValue: { now: () => now } },
			],
		});
		api = TestBed.inject(PricesApi);
		http = TestBed.inject(HttpTestingController);
	});
	afterEach(() => http.verify());

	it('caches municipality averages per fuel for five minutes', () => {
		api.getMunicipalities('GNC').subscribe();
		http.expectOne('/api/stats/municipalities?fuel=GNC').flush([['Madrid', '28', 1.958, 2]]);
		now = PRICE_CACHE_LIFETIME - 1;
		api.getMunicipalities('GNC').subscribe((rows) => expect(rows[0][2]).toBe(1.958));
		http.expectNone('/api/stats/municipalities?fuel=GNC');
		now++;
		api.getMunicipalities('GNC').subscribe();
		http.expectOne('/api/stats/municipalities?fuel=GNC').flush([]);
	});
	it('loads places once and shares the catalogue for the session', () => {
		api.getPlaces().subscribe();
		api.getPlaces().subscribe();
		http.expectOne('/api/places').flush([['Alcalá de Henares', '28', 40.48814, -3.38064, 32]]);
		api.getPlaces().subscribe((places) => expect(places[0][0]).toBe('Alcalá de Henares'));
		http.expectNone('/api/places');
	});

	it('reuses a snapshot for less than five minutes and refetches at expiry', () => {
		api.getStations('GASOLEO_A').subscribe();
		http.expectOne('/api/stations?fuel=GASOLEO_A').flush(liveSnapshot);
		now = PRICE_CACHE_LIFETIME - 1;
		api.getStations('GASOLEO_A').subscribe((data) => expect(data).toEqual(liveSnapshot));
		http.expectNone('/api/stations?fuel=GASOLEO_A');
		now++;
		api.getStations('GASOLEO_A').subscribe();
		http
			.expectOne('/api/stations?fuel=GASOLEO_A')
			.flush({ ...liveSnapshot, updatedAt: '2026-10-29T14:00:00+01:00' });
	});

	it('expires station details independently of the map snapshot', () => {
		api.getStation(4375).subscribe();
		http.expectOne('/api/stations/4375').flush(liveStation());
		now = PRICE_CACHE_LIFETIME - 1;
		api.getStation(4375).subscribe();
		http.expectNone('/api/stations/4375');
		now++;
		api.getStation(4375).subscribe();
		http.expectOne('/api/stations/4375').flush(liveStation());
	});

	it('starts the cache lifetime at the response and shares requests still in flight', () => {
		api.getStations('GASOLEO_A').subscribe();
		const request = http.expectOne('/api/stations?fuel=GASOLEO_A');
		now = PRICE_CACHE_LIFETIME + 1;
		api.getStations('GASOLEO_A').subscribe();
		http.expectNone('/api/stations?fuel=GASOLEO_A');
		request.flush(liveSnapshot);
		now += PRICE_CACHE_LIFETIME - 1;
		api.getStations('GASOLEO_A').subscribe();
		http.expectNone('/api/stations?fuel=GASOLEO_A');
	});

	it('retains cached names after price caches expire', () => {
		api.getStationSummaries([1]).subscribe();
		http
			.expectOne('/api/stations/summaries?ids=1')
			.flush([{ id: 1, name: 'Station', municipality: 'Town' }]);
		now = 60 * 60_000;
		api.getStationSummaries([1]).subscribe((rows) => expect(rows[0].name).toBe('Station'));
		http.expectNone((request) => request.url === '/api/stations/summaries');
	});

	it('batches uncached summaries and joins sorted response rows by id', () => {
		const a = { id: 1, name: 'Station A', municipality: 'A' };
		const b = { id: 2, name: 'Station B', municipality: 'B' };
		api.getStationSummaries([2, 1, 2]).subscribe((rows) => expect(rows).toEqual([b, a]));
		http.expectOne('/api/stations/summaries?ids=2,1').flush([a, b]);
		api.getStationSummaries([1, 2]).subscribe((rows) => expect(rows).toEqual([a, b]));
		http.expectNone((req) => req.url === '/api/stations/summaries');
		const c = { id: 3, name: 'Station C', municipality: 'C' };
		api.getStationSummaries([2, 3]).subscribe((rows) => expect(rows).toEqual([b, c]));
		http.expectOne('/api/stations/summaries?ids=3').flush([c]);
	});

	it('keeps omitted names absent and remembers unknown ids without extra requests', () => {
		api.getStationSummaries([99]).subscribe((rows) => expect(rows).toEqual([]));
		http.expectOne('/api/stations/summaries?ids=99').flush([]);
		api.getStationSummaries([99]).subscribe((rows) => expect(rows).toEqual([]));
		api.getStationSummaries([]).subscribe((rows) => expect(rows).toEqual([]));
		http.expectNone((req) => req.url === '/api/stations/summaries');
	});

	it('retries summary ids after a failed batch', () => {
		api.getStationSummaries([1]).subscribe({ error: (error) => expect(error.status).toBe(500) });
		http.expectOne('/api/stations/summaries?ids=1').flush({}, { status: 500, statusText: 'Error' });
		api.getStationSummaries([1]).subscribe();
		http.expectOne('/api/stations/summaries?ids=1').flush([]);
	});

	it('loads the current snapshot and preserves null fuel prices', () => {
		api.getCurrent().subscribe((data) => expect(data).toEqual(liveCurrent));
		http.expectOne('/api/stats/current').flush(liveCurrent);
	});

	it('reuses station snapshots and shares concurrent requests per fuel', () => {
		api.getStations('GASOLEO_A').subscribe();
		api.getStations('GASOLEO_A').subscribe();
		http.expectOne('/api/stations?fuel=GASOLEO_A').flush(liveSnapshot);
		api.getStations('GASOLINA_95_E5').subscribe();
		http.expectOne('/api/stations?fuel=GASOLINA_95_E5').flush({ ...liveSnapshot, stations: [] });
		api.getStations('GASOLEO_A').subscribe((data) => expect(data).toEqual(liveSnapshot));
		http.expectNone('/api/stations?fuel=GASOLEO_A');
	});

	it('does not retain a failed station request in the cache', () => {
		api.getStations('GASOLEO_A').subscribe({ error: (error) => expect(error.status).toBe(500) });
		http.expectOne('/api/stations?fuel=GASOLEO_A').flush({}, { status: 500, statusText: 'Error' });
		api.getStations('GASOLEO_A').subscribe();
		http.expectOne('/api/stations?fuel=GASOLEO_A').flush(liveSnapshot);
	});

	it('maps missing current snapshots to null without hiding other errors', () => {
		api.getCurrent().subscribe((data) => expect(data).toBeNull());
		http.expectOne('/api/stats/current').flush({}, { status: 404, statusText: 'Not Found' });
		api.getStations('GASOLEO_A').subscribe((data) => expect(data).toBeNull());
		http
			.expectOne('/api/stations?fuel=GASOLEO_A')
			.flush({}, { status: 404, statusText: 'Not Found' });
	});

	it('caches detail requests and title cases the station province', () => {
		api.getStation(4375).subscribe((data) => expect(data.province).toBe('Albacete'));
		http.expectOne('/api/stations/4375').flush(liveStation());
		api.getStation(4375).subscribe();
		http.expectNone('/api/stations/4375');
	});

	it('loads areas and title cases provinces while preserving Spain', () => {
		api.getAreas().subscribe((areas) =>
			expect(areas).toEqual([
				{ id: 'ES', name: 'España' },
				{ id: '38', name: 'Santa Cruz de Tenerife' },
			]),
		);
		const request = http.expectOne('/api/areas');
		expect(request.request.method).toBe('GET');
		request.flush([
			{ id: 'ES', name: 'España' },
			{ id: '38', name: 'SANTA CRUZ DE TENERIFE' },
		]);
	});

	it('requests the default trend range and preserves null prices', () => {
		api.getTrend('GASOLEO_A', 'ES').subscribe((trend) => expect(trend).toEqual(sampleTrend));
		const request = http.expectOne('/api/stats/trend?fuel=GASOLEO_A&area=ES');
		expect(request.request.method).toBe('GET');
		request.flush(sampleTrend);
	});

	it('includes an explicit trend range and maps the province name', () => {
		api.getTrend('GASOLEO_A', '08', '2025-10-28', '2026-10-27').subscribe((trend) => {
			expect(trend?.area).toEqual({ id: '08', name: 'Barcelona' });
		});
		http
			.expectOne('/api/stats/trend?fuel=GASOLEO_A&area=08&from=2025-10-28&to=2026-10-27')
			.flush({ ...sampleTrend, area: { id: '08', name: 'BARCELONA' } });
	});

	it('maps a trend 404 to no published history', () => {
		api.getTrend('GASOLEO_A', 'ES').subscribe((trend) => expect(trend).toBeNull());
		http
			.expectOne('/api/stats/trend?fuel=GASOLEO_A&area=ES')
			.flush({ status: 404 }, { status: 404, statusText: 'Not Found' });
	});

	it('preserves invalid trend parameter errors', () => {
		api.getTrend('BAD', 'ES').subscribe({ error: (error) => expect(error.status).toBe(400) });
		http
			.expectOne('/api/stats/trend?fuel=BAD&area=ES')
			.flush({ status: 400 }, { status: 400, statusText: 'Bad Request' });
	});

	it('loads the fuel catalogue', () => {
		api.getFuels().subscribe((fuels) => expect(fuels).toEqual([sampleStats.fuel]));
		const request = http.expectOne('/api/fuels');
		expect(request.request.method).toBe('GET');
		request.flush([sampleStats.fuel]);
	});

	it('requests the latest day for the selected fuel and maps province names', () => {
		api.getProvinces('GASOLEO_A').subscribe((stats) => {
			expect(stats?.provinces[0].province).toBe('Santa Cruz de Tenerife');
			expect(stats?.national).toEqual(sampleStats.national);
		});
		const request = http.expectOne('/api/stats/provinces?fuel=GASOLEO_A');
		expect(request.request.method).toBe('GET');
		request.flush({
			...sampleStats,
			provinces: [{ ...sampleStats.provinces[0], province: 'SANTA CRUZ DE TENERIFE' }],
		});
	});

	it('includes the effective date only when requested', () => {
		api.getProvinces('GASOLEO_A', '2026-10-27').subscribe();
		http.expectOne('/api/stats/provinces?fuel=GASOLEO_A&date=2026-10-27').flush(sampleStats);
	});

	it('maps a missing imported day to the empty state', () => {
		api.getProvinces('GASOLEO_A').subscribe((stats) => expect(stats).toBeNull());
		http
			.expectOne('/api/stats/provinces?fuel=GASOLEO_A')
			.flush({ title: 'No data', status: 404 }, { status: 404, statusText: 'Not Found' });
	});

	it('preserves failures other than a missing day', () => {
		api.getProvinces('BAD').subscribe({ error: (error) => expect(error.status).toBe(400) });
		http
			.expectOne('/api/stats/provinces?fuel=BAD')
			.flush({ title: 'Bad fuel', status: 400 }, { status: 400, statusText: 'Bad Request' });
	});

	it('asks for the board of a box, a circle or a province', () => {
		api.getZone({ kind: 'province', id: '08' }).subscribe();
		http.expectOne('/api/stats/zone?province=08').flush({});
		api
			.getZone({ kind: 'circle', origin: { latitude: 40.3, longitude: -3.73 }, radius: 10 })
			.subscribe();
		http.expectOne('/api/stats/zone?latitude=40.3&longitude=-3.73&radius=10').flush({});
		api.getZone({ kind: 'box', bounds: { west: -4, south: 40, east: -3, north: 41 } }).subscribe();
		http.expectOne('/api/stats/zone?west=-4&south=40&east=-3&north=41').flush({});
	});

	it('loads the charging sites once and treats none imported yet as empty', () => {
		let first: unknown = 'pending';
		api.getChargingSites().subscribe((data) => (first = data));
		http.expectOne('/api/charging/sites').flush({}, { status: 404, statusText: 'Not Found' });
		expect(first).toBeNull();
		api.getChargingSites().subscribe();
		http.expectOne('/api/charging/sites').flush({ updatedAt: 'x', sites: [] });
		api.getChargingSites().subscribe();
		http.expectNone('/api/charging/sites');
	});
});
