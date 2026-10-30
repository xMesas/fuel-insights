import { TestBed } from '@angular/core/testing';
import { FuelPicker } from './fuel-picker';
import { FuelPreference } from './fuel-preference';
import { Fuel } from './price-models';

const fuels: Fuel[] = [
	{ code: 'GASOLEO_A', name: 'Gasóleo A', shortName: 'Diésel', main: true, unit: 'l' },
	{
		code: 'GASOLINA_95_E5',
		name: 'Gasolina 95 E5',
		shortName: 'Gasolina 95',
		main: true,
		unit: 'l',
	},
	{
		code: 'GASOLEO_PREMIUM',
		name: 'Gasóleo Premium',
		shortName: 'Diésel Premium',
		main: true,
		unit: 'l',
	},
	{
		code: 'GASOLINA_98_E5',
		name: 'Gasolina 98 E5',
		shortName: 'Gasolina 98',
		main: true,
		unit: 'l',
	},
	{ code: 'GLP', name: 'Gas licuado del petróleo', shortName: 'GLP', main: false, unit: 'l' },
];

describe('FuelPicker', () => {
	beforeEach(() => localStorage.clear());
	async function create() {
		const fixture = TestBed.createComponent(FuelPicker);
		fixture.componentRef.setInput('fuels', fuels);
		await fixture.whenStable();
		return fixture;
	}
	it('offers two primary radio buttons and Otros', async () => {
		const fixture = await create();
		expect(fixture.nativeElement.querySelectorAll('input[type=radio]')).toHaveLength(2);
		expect(fixture.nativeElement.querySelector('[role=combobox]').placeholder).toBe('Otros');
	});
	it('uses the API short names without EU identifiers', async () => {
		const fixture = await create();
		const labels = [...fixture.nativeElement.querySelectorAll('label')].map((label: any) =>
			label.textContent.trim(),
		);
		expect(labels).toEqual(['Diésel', 'Gasolina 95']);
	});
	it('filters other fuels ignoring accents and case', async () => {
		const fixture = await create();
		const input = fixture.nativeElement.querySelector('[role=combobox]');
		input.dispatchEvent(new FocusEvent('focus'));
		input.value = 'DIESEL';
		input.dispatchEvent(new Event('input'));
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelectorAll('[role=option]')).toHaveLength(1);
		expect(fixture.nativeElement.querySelector('[role=option]').textContent).toContain(
			'Diésel Premium',
		);
	});
	it('selects an extra fuel with the keyboard and persists the preference', async () => {
		const fixture = await create();
		const input = fixture.nativeElement.querySelector('[role=combobox]');
		input.dispatchEvent(new FocusEvent('focus'));
		input.value = '98';
		input.dispatchEvent(new Event('input'));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await fixture.whenStable();
		expect(TestBed.inject(FuelPreference).fuel()).toBe('GASOLINA_98_E5');
		expect(input.value).toBe('Gasolina 98');
		expect(input.getAttribute('aria-expanded')).toBe('false');
	});
	it('closes the extra list with Escape without changing the fuel', async () => {
		const fixture = await create();
		const input = fixture.nativeElement.querySelector('[role=combobox]');
		input.dispatchEvent(new FocusEvent('focus'));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		await fixture.whenStable();
		expect(input.getAttribute('aria-expanded')).toBe('false');
		expect(TestBed.inject(FuelPreference).fuel()).toBe('GASOLEO_A');
	});
});
