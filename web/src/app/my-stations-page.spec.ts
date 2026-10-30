import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { Account } from './account';
import { FuelPreference } from './fuel-preference';
import { MyStationsPage } from './my-stations-page';

describe('MyStationsPage', () => {
	const user = { email: 'ana@example.es', premium: false, alertLimit: 3 };
	const current = signal<typeof user | null>(user);
	const fuel = signal('GASOLEO_A');
	const refresh = vi.fn();
	beforeEach(() => {
		current.set(user);
		fuel.set('GASOLEO_A');
		refresh.mockReset();
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				provideRouter([]),
				{
					provide: ActivatedRoute,
					useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
				},
				{
					provide: Account,
					useValue: {
						account: current,
						load: () => of(current()),
						refresh,
						favouritesReady: signal(true),
						pending: signal([]),
						clearSession: () => current.set(null),
					},
				},
				{ provide: FuelPreference, useValue: { fuel, choose: (value: string) => fuel.set(value) } },
			],
		});
	});
	afterEach(() => {
		vi.useRealTimers();
		TestBed.inject(HttpTestingController).verify();
	});
	async function setup() {
		const fixture = TestBed.createComponent(MyStationsPage);
		const http = TestBed.inject(HttpTestingController);
		http.expectOne('/api/me/favourites').flush([
			{ id: 1, name: 'First', town: 'Sabadell', prices: { GASOLEO_A: 1.9, GASOLINA_95_E5: 1.5 } },
			{ id: 2, name: 'Second', town: 'Terrassa', prices: { GASOLEO_A: 1.7, GASOLINA_95_E5: 1.8 } },
		]);
		http.expectOne('/api/me/alerts').flush([]);
		http.expectOne('/api/fuels').flush([
			{ code: 'GASOLEO_A', name: 'Gasóleo A', unit: 'l', main: true },
			{ code: 'GASOLINA_95_E5', name: 'Gasolina 95', unit: 'l', main: true },
		]);
		await fixture.whenStable();
		return fixture;
	}
	it('sorts favourites by the chosen fuel', async () => {
		const fixture = await setup();
		expect(
			[...fixture.nativeElement.querySelectorAll('h3')].map((node: any) => node.textContent),
		).toEqual(['Second', 'First']);
		fuel.set('GASOLINA_95_E5');
		await fixture.whenStable();
		expect(
			[...fixture.nativeElement.querySelectorAll('h3')].map((node: any) => node.textContent),
		).toEqual(['First', 'Second']);
	});
	it('asks for confirmation before deleting the account', async () => {
		const fixture = await setup();
		const buttons: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('button')];
		buttons.find((button) => button.textContent?.trim() === 'Borrar mi cuenta')!.click();
		await fixture.whenStable();
		TestBed.inject(HttpTestingController).expectNone((req) => req.method === 'DELETE');
		expect(fixture.nativeElement.textContent).toContain('No se puede deshacer.');
		fixture.nativeElement.querySelector('.confirmation button').click();
		TestBed.inject(HttpTestingController)
			.expectOne('/api/me')
			.flush(null, { status: 204, statusText: 'No Content' });
		vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
		await fixture.whenStable();
		expect(current()).toBeNull();
	});
	it('disables checkout while the paid plan is unavailable', async () => {
		const fixture = await setup();
		fixture.componentInstance.openPlan();
		TestBed.inject(HttpTestingController)
			.expectOne('/api/me/premium/checkout')
			.flush(null, { status: 503, statusText: 'Unavailable' });
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain('Muy pronto.');
		expect(fixture.componentInstance.planUnavailable()).toBe(true);
	});
	it('redirects signed out visitors back through sign in', async () => {
		current.set(null);
		const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
		const fixture = TestBed.createComponent(MyStationsPage);
		await fixture.whenStable();
		expect(navigate).toHaveBeenCalledWith(['/entrar'], {
			queryParams: { volver: '/mis-gasolineras' },
		});
	});
	it('opens the portal for an active paid plan', async () => {
		current.set({ ...user, premium: true });
		const fixture = await setup();
		expect(fixture.nativeElement.textContent).toContain('Plan sin anuncios activo.');
		expect(fixture.nativeElement.textContent).not.toContain('Hasta 3 alertas');
		fixture.componentInstance.openPlan();
		TestBed.inject(HttpTestingController)
			.expectOne('/api/me/premium/portal')
			.flush(null, { status: 503, statusText: 'Unavailable' });
		await fixture.whenStable();
	});
	it('stops checking Stripe activation after five attempts', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		TestBed.overrideProvider(ActivatedRoute, {
			useValue: { snapshot: { queryParamMap: convertToParamMap({ 'sin-anuncios': 'gracias' }) } },
		});
		refresh.mockReturnValue(of(user));
		const fixture = await setup();
		await vi.advanceTimersByTimeAsync(12000);
		expect(refresh).toHaveBeenCalledTimes(5);
		fixture.destroy();
	});
});
