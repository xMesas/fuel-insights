import { TestBed } from '@angular/core/testing';
import { PriceBoard, weekText } from './price-board';
import { liveCurrent } from './live-fixture';

describe('PriceBoard', () => {
	it('moves selection with arrow keys and focuses the chosen radio', async () => {
		const fixture = TestBed.createComponent(PriceBoard);
		fixture.componentRef.setInput('stats', liveCurrent);
		await fixture.whenStable();
		const choose = vi.fn();
		fixture.componentInstance.choose.subscribe(choose);
		const radios = fixture.nativeElement.querySelectorAll('input');
		radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		expect(choose).toHaveBeenCalledWith('GASOLINA_95_E5');
		expect(document.activeElement).toBe(radios[1]);
	});

	it('keeps the fuel choices and says when the chosen fuel has no station in the zone', async () => {
		const fixture = TestBed.createComponent(PriceBoard);
		fixture.componentRef.setInput('stats', liveCurrent);
		fixture.componentRef.setInput('zone', {
			updatedAt: liveCurrent.updatedAt,
			weekAgo: null,
			fuels: [],
		});
		fixture.componentRef.setInput('scopeLabel', 'en Ninguna');
		await fixture.whenStable();
		// The primary choices stay available even in an empty zone.
		expect(fixture.nativeElement.querySelectorAll('fieldset label')).toHaveLength(2);
		expect(fixture.nativeElement.textContent).not.toContain('Sin precio');
		expect(fixture.nativeElement.textContent).toContain(
			'No hay gasolineras con Gasóleo A en Ninguna.',
		);
	});

	it('gives the zone average of the chosen fuel and its change in a week, and no other prices', async () => {
		const fixture = TestBed.createComponent(PriceBoard);
		fixture.componentRef.setInput('stats', liveCurrent);
		fixture.componentRef.setInput('scopeLabel', 'a menos de 10 km de Getafe');
		fixture.componentRef.setInput('zone', {
			updatedAt: liveCurrent.updatedAt,
			weekAgo: '2026-10-22',
			fuels: [
				{
					fuel: liveCurrent.fuels[0].fuel,
					minPrice: 1.689,
					averagePrice: 1.912,
					stations: 40,
					weekAgoAverage: 1.9,
				},
			],
		});
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('.context').textContent.trim()).toBe(
			'Media a menos de 10 km de Getafe: 1,912 €/l. Sube 1,2 cént. en 7 días.',
		);
		expect(fixture.nativeElement.querySelectorAll('fieldset label')).toHaveLength(2);
		expect(fixture.nativeElement.querySelector('fieldset').textContent).not.toContain('€');
	});

	it('lets a chosen province be cleared from the board', async () => {
		const fixture = TestBed.createComponent(PriceBoard);
		fixture.componentRef.setInput('stats', liveCurrent);
		fixture.componentRef.setInput('focusName', 'Barcelona');
		const clear = vi.fn();
		fixture.componentInstance.clearScope.subscribe(clear);
		await fixture.whenStable();
		const button = fixture.nativeElement.querySelector('.clear') as HTMLButtonElement;
		expect(button.getAttribute('aria-label')).toBe('Quitar Barcelona del mapa');
		button.click();
		expect(clear).toHaveBeenCalledOnce();
	});
});

describe('weekText', () => {
	it('says how many cents the zone moved, or nothing without a week-old day', () => {
		expect(weekText(1.912, 1.9)).toBe('sube 1,2 cént. en 7 días');
		expect(weekText(1.88, 1.9)).toBe('baja 2,0 cént. en 7 días');
		expect(weekText(1.9, 1.9)).toBe('igual que hace 7 días');
		expect(weekText(1.9, null)).toBe('');
	});
});
