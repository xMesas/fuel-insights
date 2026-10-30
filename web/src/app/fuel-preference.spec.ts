import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FuelPreference } from './fuel-preference';

describe('FuelPreference', () => {
	beforeEach(() => localStorage.clear());
	it('defaults to diesel', () => {
		expect(TestBed.inject(FuelPreference).fuel()).toBe('GASOLEO_A');
	});
	it('persists a choice in the browser', () => {
		TestBed.inject(FuelPreference).choose('GASOLINA_95_E5');
		expect(localStorage.getItem('fuel-insights-fuel')).toBe('GASOLINA_95_E5');
	});
	it('restores the choice after the initial render', () => {
		localStorage.setItem('fuel-insights-fuel', 'GASOLINA_95_E5');
		const preference = TestBed.inject(FuelPreference);
		expect(preference.fuel()).toBe('GASOLEO_A');
		TestBed.tick();
		expect(preference.fuel()).toBe('GASOLINA_95_E5');
	});
	it('never reads browser storage on the server', () => {
		TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
		const read = vi.spyOn(Storage.prototype, 'getItem');
		TestBed.inject(FuelPreference);
		TestBed.tick();
		expect(read).not.toHaveBeenCalled();
	});
	it('never writes browser storage on the server', () => {
		TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
		const write = vi.spyOn(Storage.prototype, 'setItem');
		TestBed.inject(FuelPreference).choose('GASOLINA_95_E5');
		expect(write).not.toHaveBeenCalled();
	});
	it('retains the choice when storage is unavailable', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('Denied');
		});
		const preference = TestBed.inject(FuelPreference);
		preference.choose('GASOLINA_95_E5');
		expect(preference.fuel()).toBe('GASOLINA_95_E5');
	});
});
