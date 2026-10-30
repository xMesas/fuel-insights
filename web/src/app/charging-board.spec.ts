import { TestBed } from '@angular/core/testing';
import { ChargingBoard } from './charging-board';
import { chargingPoints } from './charging-fixture';

describe('ChargingBoard', () => {
	it('lists every power class fastest first with how many sites there are', async () => {
		const fixture = TestBed.createComponent(ChargingBoard);
		fixture.componentRef.setInput('sites', [...chargingPoints, chargingPoints[4]]);
		fixture.componentRef.setInput('updatedAt', '2026-10-29T10:16:20+01:00');
		await fixture.whenStable();
		const rows = [...fixture.nativeElement.querySelectorAll('label')] as HTMLElement[];
		expect(
			rows.map((row) => row.querySelector('.band-name')!.firstChild!.textContent!.trim()),
		).toEqual(['Ultrarrápida', 'Muy rápida', 'Rápida', 'Semirrápida', 'Lenta']);
		expect(rows[0].querySelector('.led')!.textContent).toBe('2');
		expect(fixture.nativeElement.textContent).toContain(
			'Sin precios: el Ministerio no los publica.',
		);
	});

	it('chooses a minimum power and dims the slower classes', async () => {
		const fixture = TestBed.createComponent(ChargingBoard);
		fixture.componentRef.setInput('sites', chargingPoints);
		const chosen = vi.fn();
		fixture.componentInstance.minBandChange.subscribe(chosen);
		fixture.componentRef.setInput('minBand', 3);
		await fixture.whenStable();
		const rows = [...fixture.nativeElement.querySelectorAll('label')] as HTMLElement[];
		expect(rows.map((row) => row.classList.contains('included'))).toEqual([
			true,
			true,
			false,
			false,
			false,
		]);
		rows[2].querySelector('input')!.dispatchEvent(new Event('change'));
		expect(chosen).toHaveBeenCalledWith(2);
	});
});
