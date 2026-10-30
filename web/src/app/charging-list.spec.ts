import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ChargingList } from './charging-list';
import { chargingPoints } from './charging-fixture';

describe('ChargingList', () => {
	let http: HttpTestingController;
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		http = TestBed.inject(HttpTestingController);
	});
	afterEach(() => http.verify());

	it('shows the most powerful sites on the map with their operator and town', async () => {
		const fixture = TestBed.createComponent(ChargingList);
		fixture.componentRef.setInput(
			'sites',
			chargingPoints.map((point) => ({ point, distanceKm: null })),
		);
		await fixture.whenStable();
		http
			.expectOne('/api/charging/sites/summaries?ids=ULTRA,RAPID,FAST,SEMI,SLOW')
			.flush([
				{ id: 'ULTRA', name: null, operator: 'Ionity', town: 'Zaragoza', openingHours: null },
			]);
		await fixture.whenStable();
		const rows = fixture.nativeElement.querySelectorAll('li');
		expect(fixture.nativeElement.querySelector('h2').textContent).toBe(
			'Los 5 más potentes de la zona del mapa',
		);
		expect(rows[0].textContent).toContain('Ionity');
		expect(rows[0].textContent).toContain('Zaragoza');
		expect(rows[0].textContent).toContain('350 kW');
		expect(rows[1].textContent).toContain('Punto de recarga');
	});

	it('says when no site of the chosen power is near the search', async () => {
		const fixture = TestBed.createComponent(ChargingList);
		fixture.componentRef.setInput('origin', { name: 'Getafe', latitude: 40.3, longitude: -3.73 });
		fixture.componentRef.setInput('minBand', 4);
		fixture.componentRef.setInput('radius', 5);
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain(
			'No hay puntos de recarga de esta potencia a menos de 5 km.',
		);
		expect(fixture.nativeElement.textContent).toContain('Ultrarrápida o más.');
	});

	it('shows the power in LED digits and pages the nearby sites five at a time', async () => {
		const fixture = TestBed.createComponent(ChargingList);
		const sites = Array.from({ length: 7 }, (_, index) => ({
			point: [`S${index}`, 40.3, -3.7, 7.4, 1] as [string, number, number, number, number],
			distanceKm: index,
		}));
		fixture.componentRef.setInput('sites', sites);
		fixture.componentRef.setInput('origin', { name: 'Getafe', latitude: 40.3, longitude: -3.73 });
		fixture.componentRef.setInput('pageSize', 5);
		fixture.componentRef.setInput('led', true);
		await fixture.whenStable();
		http.match((req) => req.url === '/api/charging/sites/summaries');
		expect(fixture.nativeElement.querySelector('h2').textContent).toBe(
			'7 puntos de recarga a menos de 10 km de Getafe',
		);
		expect(fixture.nativeElement.querySelectorAll('li')).toHaveLength(5);
		expect(fixture.nativeElement.querySelector('.led').textContent).toBe('7.4kW');
		expect(fixture.nativeElement.querySelector('li .visually-hidden').textContent).toBe('7,4 kW');
		(fixture.nativeElement.querySelector('.more') as HTMLButtonElement).click();
		await fixture.whenStable();
		http.match((req) => req.url === '/api/charging/sites/summaries');
		expect(fixture.nativeElement.querySelectorAll('li')).toHaveLength(7);
		expect(fixture.nativeElement.querySelector('.more')).toBeNull();
	});
});
