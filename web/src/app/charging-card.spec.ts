import { TestBed } from '@angular/core/testing';
import { ChargingCard } from './charging-card';
import { chargingSite } from './charging-fixture';
import { PRICE_CLOCK } from './price-clock';

describe('ChargingCard', () => {
	beforeEach(() =>
		TestBed.configureTestingModule({
			providers: [
				{ provide: PRICE_CLOCK, useValue: { now: () => Date.parse('2026-10-29T14:00:00Z') } },
			],
		}),
	);

	it('answers how fast, which connectors and how to pay, and says there is no price', async () => {
		const fixture = TestBed.createComponent(ChargingCard);
		fixture.componentRef.setInput('site', chargingSite);
		await fixture.whenStable();
		const text = fixture.nativeElement.textContent;
		expect(fixture.nativeElement.querySelector('.pill').textContent).toBe('Rápida');
		expect(fixture.nativeElement.querySelector('h2').textContent).toBe('Iberdrola');
		expect(text).toContain('50 kW');
		expect(text).toContain('2 puntos de carga');
		expect(text).toContain('CCS2 · DC');
		expect(text).toContain('2 × 22 kW');
		expect(text).toContain('Pago: App, Tarjeta bancaria.');
		expect(text).toContain('Horario no publicado');
		expect(text).toContain('Sin precio ni disponibilidad en tiempo real');
		expect(text).toContain('Calle Madrid 12, 28901 Getafe, Madrid');
	});

	it('reads the hours like a fuel station when the feed has them', async () => {
		const fixture = TestBed.createComponent(ChargingCard);
		const allDay: [string, string][][] = Array.from({ length: 7 }, () => [['00:00', '24:00']]);
		fixture.componentRef.setInput('site', {
			...chargingSite,
			schedule: 'Lunes (00:00 - 23:59)',
			openingHours: allDay,
		});
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain('Abierta 24 h');
	});

	it('closes the directions menu first and the card on a second Escape', async () => {
		const fixture = TestBed.createComponent(ChargingCard);
		fixture.componentRef.setInput('site', chargingSite);
		const close = vi.fn();
		fixture.componentInstance.close.subscribe(close);
		await fixture.whenStable();
		(fixture.nativeElement.querySelector('.primary') as HTMLButtonElement).click();
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelectorAll('#charging-directions a')).toHaveLength(3);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		await fixture.whenStable();
		expect(close).not.toHaveBeenCalled();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(close).toHaveBeenCalledOnce();
	});

	it('leaves an Escape pressed in another text field, such as the town search, to that field', async () => {
		const fixture = TestBed.createComponent(ChargingCard);
		fixture.componentRef.setInput('site', chargingSite);
		const close = vi.fn();
		fixture.componentInstance.close.subscribe(close);
		await fixture.whenStable();
		const search = document.createElement('input');
		document.body.append(search);
		search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(close).not.toHaveBeenCalled();
		search.remove();
	});
});
