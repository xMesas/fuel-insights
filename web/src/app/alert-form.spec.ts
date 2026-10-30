import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Account } from './account';
import { AlertForm } from './alert-form';

describe('AlertForm', () => {
	beforeEach(() =>
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: Account, useValue: { account: signal({ premium: false, alertLimit: 3 }) } },
			],
		}),
	);
	afterEach(() => TestBed.inject(HttpTestingController).verify());
	async function setup() {
		const fixture = TestBed.createComponent(AlertForm);
		fixture.componentRef.setInput('station', {
			id: 1,
			name: 'REPSOL',
			town: 'Sabadell',
			provinceId: '08',
			prices: { GASOLEO_A: 1.859 },
		});
		fixture.componentRef.setInput('fuels', [
			{ code: 'GASOLEO_A', name: 'Gasóleo A', unit: 'l', main: true },
		]);
		fixture.componentRef.setInput('selected', 'GASOLEO_A');
		await fixture.whenStable();
		return fixture;
	}
	it('defaults to two cents below the current price', async () => {
		const fixture = await setup();
		expect(fixture.componentInstance.model().threshold).toBe(1.839);
	});
	it('explains the free account limit after 409', async () => {
		const fixture = await setup();
		fixture.nativeElement
			.querySelector('form')
			.dispatchEvent(new Event('submit', { cancelable: true }));
		TestBed.inject(HttpTestingController)
			.expectOne('/api/me/alerts')
			.flush(null, { status: 409, statusText: 'Conflict' });
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain(
			'Ya tienes 3 alertas: borra una para crear otra.',
		);
	});
	it('does not submit a threshold outside the allowed range', async () => {
		const fixture = await setup();
		fixture.componentInstance.model.update((value) => ({ ...value, threshold: 10 }));
		await fixture.whenStable();
		fixture.componentInstance.save();
		TestBed.inject(HttpTestingController).expectNone('/api/me/alerts');
	});
});
