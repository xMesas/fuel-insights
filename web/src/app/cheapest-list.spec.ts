import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CheapestList } from './cheapest-list';
import { liveSnapshot } from './live-fixture';
import { PRICE_CLOCK } from './price-clock';

describe('CheapestList', () => {
	let http: HttpTestingController;
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: PRICE_CLOCK, useValue: { now: () => Date.parse('2026-10-29T22:00:00Z') } },
			],
		});
		http = TestBed.inject(HttpTestingController);
	});
	afterEach(() => http.verify());

	it('labels closed stations after the town without changing their price order', async () => {
		const fixture = TestBed.createComponent(CheapestList);
		fixture.componentRef.setInput('stations', liveSnapshot.stations.slice(0, 2));
		fixture.componentRef.setInput('bounds', { west: -2, east: 0, south: 38, north: 41 });
		await fixture.whenStable();
		http.expectOne('/api/stations/summaries?ids=4375,4376').flush([
			{
				id: 4375,
				name: 'Closed cheap station',
				municipality: 'Abengibre',
				openingHours: Array.from({ length: 7 }, () => [['07:00', '22:00']]),
			},
			{
				id: 4376,
				name: 'Open station',
				municipality: 'Abengibre',
				openingHours: Array.from({ length: 7 }, () => [['00:00', '24:00']]),
			},
		]);
		await fixture.whenStable();
		const rows = fixture.nativeElement.querySelectorAll('li');
		expect(rows[0].textContent).toContain('Closed cheap station');
		expect(rows[0].querySelector('.municipality').textContent).toContain('Abengibre Cerrada');
		expect(rows[1].textContent).not.toContain('Cerrada');
	});

	it('loads ten names in one request and reuses cached names after moving', async () => {
		const fixture = TestBed.createComponent(CheapestList);
		fixture.componentRef.setInput('stations', liveSnapshot.stations);
		fixture.componentRef.setInput('bounds', { west: -2, east: 0, south: 38, north: 41 });
		await fixture.whenStable();
		const ids = liveSnapshot.stations.slice(0, 10).map((row) => row[0]);
		http
			.expectOne(`/api/stations/summaries?ids=${ids.join(',')}`)
			.flush(ids.map((id) => ({ id, name: `Station ${id}`, municipality: 'Abengibre' })));
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelectorAll('li button')).toHaveLength(10);
		fixture.componentRef.setInput('bounds', { west: -2, east: 0, south: 39.22, north: 41 });
		await fixture.whenStable();
		http.expectOne('/api/stations/summaries?ids=4385').flush([]);
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain('Gasolinera 4385');
		fixture.componentRef.setInput('bounds', { west: -2, east: 0, south: 38, north: 41 });
		await fixture.whenStable();
		http.expectNone((req) => req.url === '/api/stations/summaries');
		http.expectNone((req) => /^\/api\/stations\/\d+$/.test(req.url));
	});

	it('paginates nearby rows and keeps summary requests within fifty ids', async () => {
		const fixture = TestBed.createComponent(CheapestList);
		fixture.componentRef.setInput('pageSize', 20);
		fixture.componentRef.setInput('bounds', { west: -2, east: 0, south: 38, north: 41 });
		fixture.componentRef.setInput(
			'stations',
			Array.from({ length: 65 }, (_, id) => [id + 1, 39.2 + id / 10000, -1.5, 1.5 + id / 1000]),
		);
		fixture.componentRef.setInput('origin', { name: 'Abengibre', latitude: 39.2, longitude: -1.5 });
		await fixture.whenStable();
		const flush = () => {
			for (const request of http.match((req) => req.url === '/api/stations/summaries')) {
				const ids = request.request.params.get('ids')!.split(',');
				expect(ids.length).toBeLessThanOrEqual(50);
				request.flush(
					ids.map((id) => ({ id: Number(id), name: `Station ${id}`, municipality: 'Abengibre' })),
				);
			}
		};
		flush();
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelectorAll('li button')).toHaveLength(20);
		for (const size of [40, 60, 65]) {
			const button = [...fixture.nativeElement.querySelectorAll('button')].find(
				(item: any) => item.textContent.trim() === 'Ver más',
			) as HTMLButtonElement;
			button.click();
			await fixture.whenStable();
			flush();
			await fixture.whenStable();
			expect(fixture.nativeElement.querySelectorAll('li button')).toHaveLength(size);
		}
		expect(fixture.nativeElement.textContent).not.toContain('Ver más');
	});

	it('uses the singular nearby title and removes expansion at fifty km', async () => {
		const fixture = TestBed.createComponent(CheapestList);
		fixture.componentRef.setInput('bounds', { west: -2, east: 0, south: 38, north: 41 });
		fixture.componentRef.setInput('stations', [[1, 39.2, -1.5, 1.5]]);
		fixture.componentRef.setInput('origin', {
			name: 'Tu ubicación',
			latitude: 39.2,
			longitude: -1.5,
		});
		await fixture.whenStable();
		http.expectOne('/api/stations/summaries?ids=1').flush([]);
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain(
			'1 gasolinera a menos de 10 km de tu ubicación',
		);
		fixture.componentRef.setInput('stations', []);
		fixture.componentRef.setInput('radius', 50);
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).not.toContain('Ampliar');
	});

	it('shows a top five numbered with the prices in LED digits inside the board', async () => {
		const fixture = TestBed.createComponent(CheapestList);
		fixture.componentRef.setInput('stations', liveSnapshot.stations);
		fixture.componentRef.setInput('bounds', { west: -2, east: 0, south: 38, north: 41 });
		fixture.componentRef.setInput('pageSize', 5);
		fixture.componentRef.setInput('led', true);
		await fixture.whenStable();
		http.match((req) => req.url === '/api/stations/summaries');
		const rows = fixture.nativeElement.querySelectorAll('li');
		expect(rows).toHaveLength(5);
		expect(fixture.nativeElement.querySelector('#cheapest-title').textContent).toBe(
			'Las 5 más baratas de la zona del mapa',
		);
		expect(rows[0].querySelector('.position').textContent).toBe('1');
		expect(rows[0].querySelector('.led').textContent).toBe('1.729');
		expect(rows[0].querySelector('.visually-hidden').textContent).toBe('1,729 €/l');
	});
});
