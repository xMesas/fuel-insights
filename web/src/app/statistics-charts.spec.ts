import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { StatisticsCharts } from './statistics-charts';
import { FuelPreference } from './fuel-preference';
import { brandStats, spreadStats, weekdayStats } from './statistics-fixture';

describe('StatisticsCharts', () => {
	let http: HttpTestingController;
	beforeEach(() => {
		localStorage.clear();
		TestBed.configureTestingModule({
			deferBlockBehavior: DeferBlockBehavior.Manual,
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
	});
	afterEach(() => http.verify());

	async function create() {
		http = TestBed.inject(HttpTestingController);
		const fixture = TestBed.createComponent(StatisticsCharts);
		fixture.componentRef.setInput('provinces', [
			{ id: '01', name: 'Álava' },
			{ id: '08', name: 'Barcelona' },
		]);
		await fixture.whenStable();
		return fixture;
	}
	function flush(code = 'GASOLEO_A') {
		http.expectOne(`/api/stats/weekdays?fuel=${code}`).flush(weekdayStats);
		http.expectOne(`/api/stats/spread?fuel=${code}`).flush(spreadStats);
		http.expectOne(`/api/stats/brands?fuel=${code}`).flush(brandStats);
	}

	it('renders all conclusions before the deferred charts load', async () => {
		const fixture = await create();
		flush();
		await fixture.whenStable();
		const text = fixture.nativeElement.textContent;
		expect(text).toContain('el lunes fue el día más barato');
		expect(text).toContain('20,0 céntimos por litro: 10,00 €');
		expect(text).toContain('bonÀrea es la marca más barata');
		expect(fixture.nativeElement.querySelector('app-statistics-plot')).toBeNull();
	});

	it('renders the same conclusions with the server platform', async () => {
		TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
		const fixture = await create();
		flush();
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelectorAll('.conclusion')).toHaveLength(3);
		expect(fixture.nativeElement.textContent).toContain('0,4 céntimos por litro');
		expect(fixture.nativeElement.querySelector('app-statistics-plot')).toBeNull();
	});

	it('keeps all chart numbers in tables without loading ECharts', async () => {
		const fixture = await create();
		flush();
		await fixture.whenStable();
		const tables: NodeListOf<HTMLTableElement> = fixture.nativeElement.querySelectorAll('table');
		expect(tables).toHaveLength(3);
		expect(tables[0].querySelector('tbody th')?.textContent).toBe('lunes');
		expect(tables[1].textContent).toContain('Álava');
		expect(tables[1].textContent).toContain('1,700 €/l');
		expect(tables[2].querySelector('tbody th')?.textContent).toBe('bonÀrea');
	});

	it('shows the Ministry effective date and time for current statistics', async () => {
		const fixture = await create();
		flush();
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain(
			'Precios del Ministerio del 29 oct 2026 a las 21:45',
		);
	});

	it('refetches each chart when the shared fuel preference changes', async () => {
		const fixture = await create();
		flush();
		await fixture.whenStable();
		TestBed.inject(FuelPreference).choose('GASOLINA_95_E5');
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelectorAll('.conclusion')).toHaveLength(0);
		flush('GASOLINA_95_E5');
		await fixture.whenStable();
	});

	it('cancels stale requests after a fuel switch', async () => {
		const fixture = await create();
		const pending = http.match((request) => request.url.startsWith('/api/stats/'));
		TestBed.inject(FuelPreference).choose('GASOLINA_95_E5');
		await fixture.whenStable();
		expect(pending.every((request) => request.cancelled)).toBe(true);
		flush('GASOLINA_95_E5');
		await fixture.whenStable();
	});

	it('retries a failed chart without hiding the other statistics', async () => {
		const fixture = await create();
		http
			.expectOne('/api/stats/weekdays?fuel=GASOLEO_A')
			.flush({}, { status: 500, statusText: 'Error' });
		http.expectOne('/api/stats/spread?fuel=GASOLEO_A').flush(spreadStats);
		http.expectOne('/api/stats/brands?fuel=GASOLEO_A').flush(brandStats);
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelectorAll('.conclusion')).toHaveLength(2);
		fixture.nativeElement.querySelector('button').click();
		await fixture.whenStable();
		http.expectOne('/api/stats/weekdays?fuel=GASOLEO_A').flush(weekdayStats);
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelectorAll('.conclusion')).toHaveLength(3);
	});

	it('shows an explanation instead of a blank chart for empty responses', async () => {
		const fixture = await create();
		http.expectOne('/api/stats/weekdays?fuel=GASOLEO_A').flush({ ...weekdayStats, weekdays: [] });
		http
			.expectOne('/api/stats/spread?fuel=GASOLEO_A')
			.flush({ ...spreadStats, spain: { ...spreadStats.spain, stations: 0 }, provinces: [] });
		http.expectOne('/api/stats/brands?fuel=GASOLEO_A').flush({ ...brandStats, brands: [] });
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelectorAll('.conclusion')).toHaveLength(0);
		expect(fixture.nativeElement.textContent).toContain('suficientes días completos');
		expect(fixture.nativeElement.textContent).toContain('No hay precios');
		expect(fixture.nativeElement.textContent).toContain('No hay marcas');
	});
});
