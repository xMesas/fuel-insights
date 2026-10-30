import { TestBed } from '@angular/core/testing';
import { isolatedPoints, TrendChart } from './trend-chart';
import { sampleTrend } from './trend-fixture';

describe('TrendChart', () => {
	let themeChange: () => void;
	let motionChange: () => void;
	let reducedMotion = false;
	beforeEach(() => {
		reducedMotion = false;
		vi.stubGlobal('matchMedia', (query: string) => ({
			matches: query.includes('reduced-motion') && reducedMotion,
			addEventListener: (_event: string, callback: () => void) => {
				if (query.includes('color-scheme')) themeChange = callback;
				else motionChange = callback;
			},
			removeEventListener: vi.fn(),
		}));
		TestBed.overrideComponent(TrendChart, { set: { template: '', imports: [] } });
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		document.documentElement.style.removeProperty('--data');
	});

	async function create() {
		const fixture = TestBed.createComponent(TrendChart);
		fixture.componentRef.setInput('trend', sampleTrend);
		await fixture.whenStable();
		return fixture;
	}

	it('draws two lines without connecting missing prices', async () => {
		const fixture = await create();
		expect(fixture.componentInstance.options().series).toMatchObject([
			{ type: 'line', name: 'Media de 7 días', connectNulls: false, lineStyle: { width: 2 } },
			{ type: 'line', name: 'Media diaria', connectNulls: false, lineStyle: { width: 1 } },
		]);
	});

	it('finds the days whose neighbours both have no data', () => {
		expect([...isolatedPoints([1.5, null, 1.6, 1.7, null, 1.8])]).toEqual([0, 5]);
	});

	it('gives a marker only to isolated days, so a day between two gaps stays visible', async () => {
		const fixture = await create();
		const daily = (fixture.componentInstance.options().series as { symbolSize: Function }[])[1];
		// In the fixture, 28 Oct 2025 and 27 Oct 2026 each sit next to a day without data.
		expect(daily.symbolSize(null, { dataIndex: 0 })).toBe(8);
		expect(daily.symbolSize(null, { dataIndex: 1 })).toBe(0);
	});

	it('keeps missing points null in both series', async () => {
		const fixture = await create();
		expect(fixture.componentInstance.options().series).toMatchObject([
			{ data: sampleTrend.points.map((point) => [Date.parse(point.date), point.movingAverage7]) },
			{ data: sampleTrend.points.map((point) => [Date.parse(point.date), point.averagePrice]) },
		]);
	});

	it('opens both zoom controls on the last 90 calendar days', async () => {
		const fixture = await create();
		const end = Date.parse(sampleTrend.to);
		expect(fixture.componentInstance.options().dataZoom).toMatchObject([
			{ type: 'inside', startValue: end - 89 * 86_400_000, endValue: end },
			{ type: 'slider', startValue: end - 89 * 86_400_000, endValue: end },
		]);
	});

	it('clamps the initial zoom to a range shorter than 90 days', async () => {
		const fixture = await create();
		fixture.componentRef.setInput('trend', { ...sampleTrend, from: '2026-10-20' });
		expect(fixture.componentInstance.options().dataZoom).toMatchObject([
			{ startValue: Date.parse('2026-10-20') },
			{ startValue: Date.parse('2026-10-20') },
		]);
	});

	it('updates token colours and motion when system preferences change', async () => {
		const fixture = await create();
		document.documentElement.style.setProperty('--data', 'rgb(57, 135, 229)');
		themeChange();
		expect(fixture.componentInstance.options().series).toMatchObject([
			{ lineStyle: { color: 'rgb(57, 135, 229)' } },
			{},
		]);
		reducedMotion = true;
		motionChange();
		expect(fixture.componentInstance.options()['animation']).toBe(false);
	});

	it('exposes all tooltip values when navigating days with the keyboard', async () => {
		const fixture = await create();
		fixture.componentInstance.navigate(new KeyboardEvent('keydown', { key: 'End' }));
		expect(fixture.componentInstance.focusedDetail()).toContain('Media de 7 días: 1,465');
		expect(fixture.componentInstance.focusedDetail()).toContain('Mediana: 1,449');
		fixture.componentInstance.navigate(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
		expect(fixture.componentInstance.focusedDetail()).toContain('0 gasolineras');
	});
});
