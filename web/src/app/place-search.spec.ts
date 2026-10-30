import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PlaceSearch } from './place-search';
import { samplePlaces } from './place-fixture';
import { GeocodeResult } from './price-models';

const address: GeocodeResult = {
	id: 'portal-55',
	type: 'portal',
	kind: 'Dirección',
	label: 'Calle Portugal 55, Mollet del Vallès',
	town: 'Mollet del Vallès',
	province: 'Barcelona',
	latitude: 41.54,
	longitude: 2.21,
};

describe('PlaceSearch', () => {
	let http: HttpTestingController;
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		http = TestBed.inject(HttpTestingController);
	});
	afterEach(() => http.verify());

	async function createSearch() {
		const fixture = TestBed.createComponent(PlaceSearch);
		await fixture.whenStable();
		fixture.componentInstance.focus();
		http.expectOne('/api/places').flush(samplePlaces);
		await fixture.whenStable();
		const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
		const type = (query: string) => {
			input.value = query;
			input.dispatchEvent(new Event('input'));
		};
		return { fixture, input, type };
	}

	it('offers my location first when focused and empty', async () => {
		const { fixture, input } = await createSearch();
		const options = fixture.nativeElement.querySelectorAll('[role=option]');
		expect(options).toHaveLength(1);
		expect(options[0].textContent).toContain('Usar mi ubicación');
		const locate = vi.fn();
		fixture.componentInstance.locate.subscribe(locate);
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(locate).toHaveBeenCalledOnce();
	});

	it('requests geocoding only after three characters and 300 ms of inactivity', async () => {
		const { type, fixture } = await createSearch();
		type('ab');
		await new Promise((resolve) => setTimeout(resolve, 330));
		http.expectNone((request) => request.url === '/api/geocode');
		type('abc');
		http.expectNone((request) => request.url === '/api/geocode');
		await new Promise((resolve) => setTimeout(resolve, 330));
		http.expectOne('/api/geocode?q=abc').flush([address]);
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain('Direcciones y lugares');
		expect(fixture.nativeElement.querySelector('[role=option]').textContent).toContain('Dirección');
	});

	it('resolves a result without coordinates before choosing its origin', async () => {
		const { fixture } = await createSearch();
		const choose = vi.fn();
		fixture.componentInstance.choose.subscribe(choose);
		fixture.componentInstance.selectGeocode({ ...address, latitude: null, longitude: null });
		expect(choose).not.toHaveBeenCalled();
		http.expectOne('/api/geocode/point?id=portal-55&type=portal').flush(address);
		expect(choose).toHaveBeenCalledWith({ name: address.label, latitude: 41.54, longitude: 2.21 });
	});

	it('keeps town suggestions when geocoding returns 503', async () => {
		const { fixture, type } = await createSearch();
		type('alcala');
		await new Promise((resolve) => setTimeout(resolve, 330));
		http.expectOne('/api/geocode?q=alcala').flush({}, { status: 503, statusText: 'Unavailable' });
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelectorAll('[role=option]')).toHaveLength(2);
		expect(fixture.nativeElement.textContent).toContain('Alcalá de Henares');
	});

	it('cancels an old geocoding request immediately when the query changes', async () => {
		const { fixture, type } = await createSearch();
		type('mollet');
		await new Promise((resolve) => setTimeout(resolve, 330));
		const old = http.expectOne('/api/geocode?q=mollet');
		type('ab');
		expect(old.cancelled).toBe(true);
		expect(fixture.componentInstance.geocoded()).toEqual([]);
	});

	it('uses coordinates directly without asking for a point', async () => {
		const { fixture } = await createSearch();
		const choose = vi.fn();
		fixture.componentInstance.choose.subscribe(choose);
		fixture.componentInstance.selectGeocode(address);
		http.expectNone((request) => request.url === '/api/geocode/point');
		expect(choose).toHaveBeenCalledWith({ name: address.label, latitude: 41.54, longitude: 2.21 });
	});

	it('reports a missing point without replacing the current origin', async () => {
		const { fixture } = await createSearch();
		const choose = vi.fn();
		fixture.componentInstance.choose.subscribe(choose);
		fixture.componentInstance.selectGeocode({ ...address, latitude: null });
		http
			.expectOne('/api/geocode/point?id=portal-55&type=portal')
			.flush({}, { status: 404, statusText: 'Not Found' });
		await fixture.whenStable();
		expect(choose).not.toHaveBeenCalled();
		expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
			'No pudimos situar',
		);
	});

	it('loads the catalogue once on focus and supports keyboard selection', async () => {
		const fixture = TestBed.createComponent(PlaceSearch);
		await fixture.whenStable();
		http.expectNone('/api/places');
		const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
		input.dispatchEvent(new FocusEvent('focus'));
		http.expectOne('/api/places').flush(samplePlaces);
		input.value = 'alcala';
		input.dispatchEvent(new Event('input'));
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelectorAll('[role=option]')).toHaveLength(2);
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
		await fixture.whenStable();
		expect(input.getAttribute('aria-activedescendant')).toBe('place-option-0');
		const choose = vi.fn();
		fixture.componentInstance.choose.subscribe(choose);
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await fixture.whenStable();
		expect(choose).toHaveBeenCalledWith({
			name: 'Alcalá de Henares',
			latitude: 40.48814,
			longitude: -3.38064,
		});
		expect(input.getAttribute('aria-expanded')).toBe('false');
		input.dispatchEvent(new FocusEvent('focus'));
		http.expectNone('/api/places');
	});

	it('shows the no-match message and clears an empty field with Escape', async () => {
		const fixture = TestBed.createComponent(PlaceSearch);
		await fixture.whenStable();
		const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
		input.value = 'xyz';
		input.dispatchEvent(new Event('input'));
		http.expectOne('/api/places').flush(samplePlaces);
		await new Promise((resolve) => setTimeout(resolve, 330));
		http.expectOne('/api/geocode?q=xyz').flush([]);
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain(
			'Sin resultados. Prueba con otro nombre o usa tu ubicación.',
		);
		const choose = vi.fn();
		fixture.componentInstance.choose.subscribe(choose);
		input.value = '';
		input.dispatchEvent(new Event('input'));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(choose).toHaveBeenCalledWith(null);
	});

	it('shows the distance control only for an origin and supports arrow keys', async () => {
		const fixture = TestBed.createComponent(PlaceSearch);
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('fieldset')).toBeNull();
		fixture.componentRef.setInput('origin', { name: 'Madrid', latitude: 40.4, longitude: -3.7 });
		await fixture.whenStable();
		const radios = fixture.nativeElement.querySelectorAll('input[type=radio]');
		expect(radios).toHaveLength(4);
		const change = vi.fn();
		fixture.componentInstance.radiusChange.subscribe(change);
		radios[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
		expect(change).toHaveBeenCalledWith(25);
	});

	it('delegates location requests to the parent and displays its error', async () => {
		const fixture = TestBed.createComponent(PlaceSearch);
		await fixture.whenStable();
		const locate = vi.fn();
		fixture.componentInstance.locate.subscribe(locate);
		expect(locate).not.toHaveBeenCalled();
		fixture.nativeElement.querySelector('[aria-label="Usar mi ubicación"]').click();
		expect(locate).toHaveBeenCalledOnce();
	});
});
