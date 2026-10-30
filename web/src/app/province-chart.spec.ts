import { TestBed } from '@angular/core/testing';
import { ProvinceChart } from './province-chart';
import { sampleStats } from './price-fixture';

describe('ProvinceChart', () => {
	let reducedMotion: boolean;
	let mediaChange: () => void;
	let themeChange: () => void;
	beforeEach(() => {
		reducedMotion = false;
		vi.stubGlobal('matchMedia', (query: string) => ({
			matches: query.includes('reduced-motion') && reducedMotion,
			addEventListener: (_event: string, callback: () => void) => {
				if (query.includes('color-scheme')) themeChange = callback;
				else mediaChange = callback;
			},
			removeEventListener: vi.fn(),
		}));
		TestBed.overrideComponent(ProvinceChart, { set: { template: '', imports: [] } });
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		document.documentElement.style.removeProperty('--data');
	});

	it('keeps API order with the cheapest province at the top and a padded price axis', async () => {
		const fixture = TestBed.createComponent(ProvinceChart);
		fixture.componentRef.setInput('stats', sampleStats);
		await fixture.whenStable();
		const options = fixture.componentInstance.options();
		expect(options.yAxis).toMatchObject({
			inverse: true,
			data: [{ value: 'Santa Cruz de Tenerife' }, { value: 'Barcelona' }],
		});
		expect(options.xAxis).toMatchObject({ min: 1, max: 1.8 });
	});

	it('turns animation off when the reduced motion preference changes', async () => {
		const fixture = TestBed.createComponent(ProvinceChart);
		fixture.componentRef.setInput('stats', sampleStats);
		await fixture.whenStable();
		expect(fixture.componentInstance.options()['animation']).toBe(true);
		reducedMotion = true;
		mediaChange();
		expect(fixture.componentInstance.options()['animation']).toBe(false);
	});

	it('exposes province details when navigating with the keyboard', async () => {
		const fixture = TestBed.createComponent(ProvinceChart);
		fixture.componentRef.setInput('stats', sampleStats);
		await fixture.whenStable();
		fixture.componentInstance.navigate(new KeyboardEvent('keydown', { key: 'End' }));
		expect(fixture.componentInstance.focusedDetail()).toContain('1,689 €/l. Barcelona');
		fixture.componentInstance.navigate(new KeyboardEvent('keydown', { key: 'Home' }));
		expect(fixture.componentInstance.focusedDetail()).toContain(
			'1,152 €/l. Santa Cruz de Tenerife',
		);
	});

	it('reads the data colour again when the system theme changes', async () => {
		const fixture = TestBed.createComponent(ProvinceChart);
		fixture.componentRef.setInput('stats', sampleStats);
		await fixture.whenStable();
		const previousOptions = fixture.componentInstance.options();
		document.documentElement.style.setProperty('--data', 'rgb(57, 135, 229)');
		themeChange();
		expect(fixture.componentInstance.options()).not.toBe(previousOptions);
		expect(fixture.componentInstance.options().series).toMatchObject([
			{
				itemStyle: {
					color: 'rgb(57, 135, 229)',
				},
			},
		]);
	});
});
