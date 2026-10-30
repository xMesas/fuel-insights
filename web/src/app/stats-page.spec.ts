import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, DeferBlockBehavior } from '@angular/core/testing';
import { StatsPage } from './stats-page';
import { StatisticsCharts } from './statistics-charts';
import { Component, input } from '@angular/core';
import { Area } from './price-models';
import { liveAreas, liveFuels, liveCurrent } from './live-fixture';
import { sampleStats } from './price-fixture';
import { sampleTrend } from './trend-fixture';
@Component({ selector: 'app-statistics-charts', template: '' })
class StatisticsChartsStub {
	readonly provinces = input<Area[]>([]);
}
describe('StatsPage', () => {
	let http: HttpTestingController;
	beforeEach(async () => {
		localStorage.clear();
		TestBed.overrideComponent(StatsPage, {
			remove: { imports: [StatisticsCharts] },
			add: { imports: [StatisticsChartsStub] },
		});
		TestBed.configureTestingModule({
			deferBlockBehavior: DeferBlockBehavior.Manual,
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		await TestBed.compileComponents();
		http = TestBed.inject(HttpTestingController);
	});
	afterEach(() => http.verify());
	it('loads the trend selected with the province catalogue name', async () => {
		const fixture = await create();
		const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
		expect(select.options[1].textContent).toBe('Barcelona');
		select.value = '08';
		select.dispatchEvent(new Event('change'));
		await fixture.whenStable();
		http
			.expectOne('/api/stats/trend?fuel=GASOLEO_A&area=08')
			.flush({ ...sampleTrend, area: liveAreas[1] });
		await fixture.whenStable();
		expect(fixture.componentInstance.trend()?.area.id).toBe('08');
	});
	it('shows the initial loading state', async () => {
		const fixture = TestBed.createComponent(StatsPage);
		await fixture.whenStable();
		expect(
			fixture.nativeElement.querySelector('.trend-card [role="status"]').textContent,
		).toContain('Cargando evolución');
		http.expectOne('/api/pages/provinces').flush([]);
		http.expectOne('/api/fuels').flush(liveFuels);
		http.expectOne('/api/stats/current').flush(liveCurrent);
		http.expectOne('/api/stats/provinces?fuel=GASOLEO_A').flush(sampleStats);
		http.expectOne('/api/stats/trend?fuel=GASOLEO_A&area=ES').flush(sampleTrend);
		await fixture.whenStable();
	});
	it('uses catalogue names for the existing province chart', async () => {
		const fixture = TestBed.createComponent(StatsPage);
		await fixture.whenStable();
		http
			.expectOne('/api/pages/provinces')
			.flush([{ id: '08', name: 'Barcelona oficial', slug: 'barcelona' }]);
		http.expectOne('/api/fuels').flush(liveFuels);
		http.expectOne('/api/stats/current').flush(liveCurrent);
		http.expectOne('/api/stats/provinces?fuel=GASOLEO_A').flush(sampleStats);
		http.expectOne('/api/stats/trend?fuel=GASOLEO_A&area=ES').flush(sampleTrend);
		await fixture.whenStable();
		expect(fixture.componentInstance.provinceGroups()[0].stats.provinces[0].province).toBe(
			'Barcelona oficial',
		);
	});
	it('retries failed province statistics', async () => {
		const fixture = await create();
		fixture.componentInstance.retry();
		await fixture.whenStable();
		http
			.expectOne('/api/stats/provinces?fuel=GASOLEO_A')
			.flush({}, { status: 500, statusText: 'Error' });
		await fixture.whenStable();
		fixture.nativeElement.querySelector('.chart-card:not(.trend-card) button').click();
		await fixture.whenStable();
		http.expectOne('/api/stats/provinces?fuel=GASOLEO_A').flush(sampleStats);
		await fixture.whenStable();
		expect(fixture.componentInstance.status()).toBe('ready');
	});
	async function create() {
		const fixture = TestBed.createComponent(StatsPage);
		await fixture.whenStable();
		http
			.expectOne('/api/pages/provinces')
			.flush([{ id: '08', name: 'Barcelona', slug: 'barcelona' }]);
		http.expectOne('/api/fuels').flush(liveFuels);
		http.expectOne('/api/stats/current').flush(liveCurrent);
		http.expectOne('/api/stats/provinces?fuel=GASOLEO_A').flush(sampleStats);
		http
			.expectOne('/api/stats/trend?fuel=GASOLEO_A&area=ES')
			.flush({ ...sampleTrend, area: liveAreas[0] });
		await fixture.whenStable();
		return fixture;
	}
	async function selectFuel(fixture: Awaited<ReturnType<typeof create>>, code: string) {
		fixture.componentInstance.chooseFuel(code);
		await fixture.whenStable();
		http
			.expectOne('/api/stats/provinces?fuel=' + code)
			.flush({ ...sampleStats, fuel: liveFuels.find((row) => row.code === code) });
		http.expectOne('/api/stats/trend?fuel=' + code + '&area=ES').flush({
			...sampleTrend,
			fuel: liveFuels.find((row) => row.code === code),
			area: liveAreas[0],
		});
		await fixture.whenStable();
	}
	it('moves weekly change and the period maximum into the trend heading', async () => {
		const fixture = await create();
		const trend = fixture.componentInstance.trend()!;
		fixture.componentInstance.trend.set({
			...trend,
			points: [
				{
					date: '2026-10-22',
					averagePrice: 1.887,
					medianPrice: 1.887,
					movingAverage7: null,
					stations: 10,
				},
			],
		});
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('app-day-panel')).toBeNull();
		const text = fixture.nativeElement.querySelector('.trend-summary').textContent;
		expect(text).toContain('Sube 1,2 céntimos en 7 días.');
		expect(text).toContain('Máximo del periodo: 1,962 €/l (14 jun 2026).');
	});

	it('shows trend rows newest first with medians and missing prices', async () => {
		const fixture = await create();
		fixture.nativeElement.querySelector('.trend-table-toggle').click();
		await fixture.whenStable();
		const rows = fixture.nativeElement.querySelectorAll('#trend-table tbody tr');
		expect(rows).toHaveLength(3);
		expect(rows[0].textContent).toContain('27 oct 2026');
		expect(rows[0].textContent).toContain('1,449');
		expect(rows[1].textContent).toContain('—');
	});

	it('keeps the previous trend visible while another area loads', async () => {
		const fixture = await create();
		fixture.componentInstance.selectedArea.set('08');
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('.trend-content.reloading')).not.toBeNull();
		http
			.expectOne('/api/stats/trend?fuel=GASOLEO_A&area=08')
			.flush({ ...sampleTrend, area: liveAreas[1] });
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('.trend-content.reloading')).toBeNull();
	});

	it('retries a failed trend without replacing the current board', async () => {
		const fixture = await create();
		fixture.componentInstance.retryTrend();
		await fixture.whenStable();
		http
			.expectOne('/api/stats/trend?fuel=GASOLEO_A&area=ES')
			.flush({}, { status: 500, statusText: 'Error' });
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('.trend-card').textContent).toContain(
			'No se pudo cargar',
		);
		fixture.nativeElement.querySelector('.trend-card button').click();
		await fixture.whenStable();
		http.expectOne('/api/stats/trend?fuel=GASOLEO_A&area=ES').flush(sampleTrend);
		await fixture.whenStable();
		expect(fixture.componentInstance.trendStatus()).toBe('ready');
		http.expectNone('/api/stats/current');
	});

	it('hides the trend when every daily price is null', async () => {
		const fixture = await create();
		fixture.componentInstance.retryTrend();
		await fixture.whenStable();
		http
			.expectOne('/api/stats/trend?fuel=GASOLEO_A&area=ES')
			.flush({ ...sampleTrend, points: [sampleTrend.points[1]] });
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain('Aún sin historial para este carburante.');
	});

	it('keeps a table containing provinces from both tax groups', async () => {
		const fixture = await create();
		fixture.nativeElement.querySelector('.table-toggle').click();
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelectorAll('#province-table tbody tr')).toHaveLength(2);
		expect(fixture.nativeElement.querySelector('#province-table').textContent).toContain(
			'0,999 €/l',
		);
		expect(
			fixture.componentInstance
				.provinceGroups()
				.map((group) => group.stats.provinces.map((row) => row.provinceId)),
		).toEqual([['08'], ['38']]);
	});

	it('ignores a cancelled history response after selecting another fuel', async () => {
		const fixture = await create();
		fixture.componentInstance.retry();
		await fixture.whenStable();
		const old = http.expectOne('/api/stats/provinces?fuel=GASOLEO_A');
		await selectFuel(fixture, 'GASOLINA_95_E5');
		expect(old.cancelled).toBe(true);
		expect(fixture.componentInstance.stats()?.fuel.code).toBe('GASOLINA_95_E5');
	});
});
