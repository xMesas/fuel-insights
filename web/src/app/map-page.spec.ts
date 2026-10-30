import { Router, provideRouter } from '@angular/router';
import { signedOutAccount } from './account-fixture';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { StationMap } from './station-map';
import { MapPage } from './map-page';
import { liveAreas, liveCurrent, liveFuels, liveSnapshot, liveStation } from './live-fixture';
import { sampleStats } from './price-fixture';
import { sampleTrend } from './trend-fixture';
import { PRICE_CACHE_LIFETIME, PRICE_CLOCK } from './price-clock';
import { samplePlaces } from './place-fixture';
import { chargingSite, chargingSnapshot } from './charging-fixture';

describe('MapPage', () => {
	let http: HttpTestingController;
	let now: number;
	let geolocationDescriptor: PropertyDescriptor | undefined;
	beforeEach(() => {
		now = 0;
		// The chosen fuel is remembered in the browser; every test starts with the default one.
		localStorage.clear();
		geolocationDescriptor = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		TestBed.configureTestingModule({
			deferBlockBehavior: DeferBlockBehavior.Manual,
			providers: [
				signedOutAccount(),
				provideRouter([]),
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: PRICE_CLOCK, useValue: { now: () => now } },
			],
		});
		TestBed.overrideComponent(StationMap, { set: { template: '', imports: [] } });
		http = TestBed.inject(HttpTestingController);
	});
	afterEach(() => {
		history.replaceState(null, '', '/');
		// The board's zone figures are covered by the board and API tests; here they may stay unanswered.
		http.match((request) => request.url === '/api/stats/zone');
		http.verify();
		TestBed.resetTestingModule();
		vi.useRealTimers();
		vi.restoreAllMocks();
		if (geolocationDescriptor)
			Object.defineProperty(navigator, 'geolocation', geolocationDescriptor);
		else Reflect.deleteProperty(navigator, 'geolocation');
	});

	async function create(current: typeof liveCurrent | null = liveCurrent) {
		const fixture = TestBed.createComponent(MapPage);
		await fixture.whenStable();
		const request = http.expectOne('/api/stats/current');
		if (current) request.flush(current);
		else request.flush({}, { status: 404, statusText: 'Not Found' });
		http.expectOne('/api/fuels').flush(liveFuels);
		http.expectOne('/api/areas').flush(liveAreas);
		http.expectOne('/api/stations?fuel=GASOLEO_A').flush(liveSnapshot);
		await fixture.whenStable();
		flushDetails();
		await fixture.whenStable();
		return fixture;
	}

	function flushDetails() {
		for (const request of http.match((req) => req.url === '/api/stations/summaries')) {
			request.flush(
				request.request.params
					.get('ids')!
					.split(',')
					.map((id) => {
						const { name, municipality } = liveStation(Number(id));
						return { id: Number(id), name, municipality };
					}),
			);
		}
	}

	it('links national fuel averages with the effective Ministry timestamp', async () => {
		const fixture = await create();
		const summary: HTMLElement = fixture.nativeElement.querySelector('.national-summary');
		expect(summary.textContent).toContain('29 oct 2026, 13:45');
		expect(summary.textContent).toContain('1,899 €/l');
		expect(summary.querySelector('a[href="/precio-diesel-hoy"]')).not.toBeNull();
		expect(summary.querySelector('a[href="/precio-gasolina-hoy"]')).not.toBeNull();
	});

	async function selectFuel(
		fixture: Awaited<ReturnType<typeof create>>,
		code: string,
		cached = false,
	) {
		fixture.componentInstance.chooseFuel(code);
		await fixture.whenStable();
		if (!cached)
			http
				.expectOne(`/api/stations?fuel=${code}`)
				.flush({ ...liveSnapshot, fuel: liveFuels.find((row) => row.code === code) });
		await fixture.whenStable();
		flushDetails();
		await fixture.whenStable();
	}

	async function chooseTown(fixture: Awaited<ReturnType<typeof create>>) {
		const input: HTMLInputElement = fixture.nativeElement.querySelector('[role=combobox]');
		input.value = 'abeng';
		input.dispatchEvent(new Event('input'));
		http.expectOne('/api/places').flush(samplePlaces);
		await fixture.whenStable();
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await fixture.whenStable();
		flushDetails();
		await fixture.whenStable();
		return input;
	}

	function fakeLocation() {
		const successes: PositionCallback[] = [];
		const errors: PositionErrorCallback[] = [];
		Object.defineProperty(navigator, 'geolocation', {
			configurable: true,
			value: {
				getCurrentPosition: (success: PositionCallback, error: PositionErrorCallback) => {
					successes.push(success);
					errors.push(error);
				},
			},
		});
		return { successes, errors };
	}

	const position = (latitude = 40.4, longitude = -3.7) =>
		({ coords: { latitude, longitude } }) as GeolocationPosition;

	it('clears the nearby list radius and map origin when the field becomes empty', async () => {
		vi.spyOn(StationMap.prototype as any, 'initialize').mockResolvedValue(undefined);
		const fixture = await create();
		const blocks = await fixture.getDeferBlocks();
		await blocks[0].render(DeferBlockState.Complete);
		const input = await chooseTown(fixture);
		const map = fixture.debugElement.query(By.directive(StationMap))
			.componentInstance as StationMap;
		expect(map.origin()?.name).toBe('Abengibre');
		input.value = '';
		input.dispatchEvent(new Event('input'));
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelectorAll('input[name=radius]')).toHaveLength(0);
		expect(fixture.nativeElement.querySelector('#cheapest-title').textContent).toBe(
			'Las 5 más baratas de la zona del mapa',
		);
		expect(map.origin()).toBeNull();
	});

	it('keeps the chosen origin while typing a nonempty replacement', async () => {
		const fixture = await create();
		const input = await chooseTown(fixture);
		input.value = 'Madrid';
		input.dispatchEvent(new Event('input'));
		await fixture.whenStable();
		expect(fixture.componentInstance.origin()?.name).toBe('Abengibre');
		expect(fixture.nativeElement.querySelectorAll('input[name=radius]')).toHaveLength(4);
	});

	it('ignores a map location answer after choosing a town', async () => {
		const callbacks = fakeLocation();
		const fixture = await create();
		fixture.componentInstance.requestLocation();
		await chooseTown(fixture);
		fixture.componentInstance.radius.set(25);
		fixture.componentInstance.openStation(4375);
		await fixture.whenStable();
		flushDetails();
		http.expectOne('/api/stations/4375').flush(liveStation());
		await fixture.whenStable();
		callbacks.successes[0](position());
		await fixture.whenStable();
		expect(fixture.componentInstance.origin()?.name).toBe('Abengibre');
		expect(fixture.componentInstance.radius()).toBe(25);
		expect(fixture.componentInstance.stationId()).toBe(4375);
	});

	it('ignores a field location answer after clearing an already empty search', async () => {
		const callbacks = fakeLocation();
		const fixture = await create();
		fixture.nativeElement.querySelector('[aria-label="Usar mi ubicación"]').click();
		const input: HTMLInputElement = fixture.nativeElement.querySelector('[role=combobox]');
		input.value = '';
		input.dispatchEvent(new Event('input'));
		await fixture.whenStable();
		callbacks.successes[0](position());
		await fixture.whenStable();
		expect(fixture.componentInstance.origin()).toBeNull();
		expect(fixture.nativeElement.querySelectorAll('input[name=radius]')).toHaveLength(0);
	});

	it('only accepts the latest location request across the two buttons', async () => {
		const callbacks = fakeLocation();
		const fixture = await create();
		fixture.nativeElement.querySelector('[aria-label="Usar mi ubicación"]').click();
		fixture.componentInstance.requestLocation();
		callbacks.successes[1](position(39.211417, -1.539167));
		await fixture.whenStable();
		flushDetails();
		callbacks.successes[0](position());
		await fixture.whenStable();
		expect(fixture.componentInstance.origin()).toEqual({
			name: 'Tu ubicación',
			latitude: 39.211417,
			longitude: -1.539167,
		});
	});

	it('ignores stale location errors and shows the current one on the LED notice', async () => {
		const callbacks = fakeLocation();
		const fixture = await create();
		fixture.componentInstance.requestLocation();
		fixture.componentInstance.requestLocation();
		callbacks.errors[0]({ code: 1 } as GeolocationPositionError);
		expect(fixture.componentInstance.notice()).toBeNull();
		callbacks.errors[1]({ code: 1 } as GeolocationPositionError);
		await fixture.whenStable();
		expect(fixture.componentInstance.notice()).toContain('Revisa el permiso del navegador');
		expect(
			fixture.nativeElement.querySelector('app-led-notice [role=status]').textContent,
		).toContain('No pudimos ver tu ubicación');
	});

	it('ignores a location answer after the page is destroyed', async () => {
		const callbacks = fakeLocation();
		const fixture = await create();
		fixture.componentInstance.requestLocation();
		fixture.destroy();
		callbacks.successes[0](position());
		expect(fixture.componentInstance.origin()).toBeNull();
	});

	it('offers the two common fuels as buttons and the rest under Otros, without any price', async () => {
		const fixture = await create();
		const page: HTMLElement = fixture.nativeElement;
		const board = page.querySelector('app-price-board')!;
		expect(board.querySelectorAll('input[type="radio"]')).toHaveLength(2);
		expect(board.querySelector('[role="combobox"]')).not.toBeNull();
		expect(board.querySelector('app-fuel-picker')!.textContent).not.toContain('€');
		// Until the zone answers, the board gives no average rather than another zone's.
		expect(board.querySelector('.context')!.textContent).toBe('');
		http
			.match((request) => request.url === '/api/stats/zone')
			.at(-1)!
			.flush({
				updatedAt: liveCurrent.updatedAt,
				weekAgo: null,
				fuels: [
					{
						fuel: liveFuels[0],
						minPrice: 1.5,
						averagePrice: 1.8,
						stations: 9,
						weekAgoAverage: null,
					},
				],
			});
		await fixture.whenStable();
		expect(board.textContent).toContain('Media en la zona del mapa: 1,800 €/l.');
		expect(board.textContent).not.toContain('Sin precio');
		expect(page.textContent).toContain('Precios del Ministerio de las 13:45 del 29 oct');
		expect(page.querySelector('h1')?.textContent).toBe(
			'Precio de la gasolina, el diésel y la recarga eléctrica',
		);
	});

	it('changes fuel without requesting the current board again and reuses station snapshots', async () => {
		const fixture = await create();
		fixture.nativeElement.querySelector('input[value="GASOLINA_95_E5"]').click();
		await selectFuel(fixture, 'GASOLINA_95_E5');
		expect(fixture.componentInstance.selectedFuel()).toBe('GASOLINA_95_E5');
		http.expectNone('/api/stats/current');
		await selectFuel(fixture, 'GASOLEO_A', true);
		http.expectNone('/api/stations?fuel=GASOLEO_A');
	});

	it('outlines a province chosen on the map and lets the board clear it', async () => {
		const fixture = await create();
		fixture.componentInstance.focusProvince('08');
		await fixture.whenStable();
		// The board keeps following the map; only the history follows the province.
		http.expectNone('/api/stats/zone?province=08');
		await fixture.whenStable();
		const board: HTMLElement = fixture.nativeElement.querySelector('app-price-board');
		expect(board.textContent).toContain(`${liveAreas[1].name}, marcada en el mapa`);
		(board.querySelector('.clear') as HTMLButtonElement).click();
		await fixture.whenStable();
		expect(fixture.componentInstance.selectedArea()).toBe('ES');
	});

	it('shows no average of another zone while a new one loads or after it fails', async () => {
		const fixture = await create();
		http
			.match((request) => request.url === '/api/stats/zone')
			.at(-1)!
			.flush({
				updatedAt: liveCurrent.updatedAt,
				weekAgo: null,
				fuels: [
					{
						fuel: liveFuels[0],
						minPrice: 1.555,
						averagePrice: 1.8,
						stations: 9,
						weekAgoAverage: null,
					},
				],
			});
		await fixture.whenStable();
		const context = (): string =>
			fixture.nativeElement.querySelector('app-price-board .context').textContent;
		expect(context()).toContain('Media en la zona del mapa: 1,800 €/l.');
		fixture.componentInstance.setOrigin({ name: 'Getafe', latitude: 40.3, longitude: -3.73 });
		await fixture.whenStable();
		expect(context()).toBe('');
		http
			.expectOne('/api/stats/zone?latitude=40.3&longitude=-3.73&radius=10')
			.flush({}, { status: 500, statusText: 'Error' });
		await fixture.whenStable();
		expect(context()).toBe('');
	});

	it('follows the search circle and drops the province when a town is chosen', async () => {
		const fixture = await create();
		fixture.componentInstance.focusProvince('08');
		await fixture.whenStable();
		fixture.componentInstance.setOrigin({ name: 'Getafe', latitude: 40.3, longitude: -3.73 });
		await fixture.whenStable();
		expect(fixture.componentInstance.provinceFocus()).toBeNull();
		expect(fixture.componentInstance.scopeLabel()).toBe('a menos de 10 km de Getafe');
		http.expectOne('/api/stats/zone?latitude=40.3&longitude=-3.73&radius=10');
	});

	it('uses every station in the search circle for comparison and falls back to the station province when cleared', async () => {
		const fixture = await create();
		fixture.componentInstance.snapshot.set({
			...liveSnapshot,
			stations: [
				[4375, 39.211417, -1.539167, 1.5],
				[4376, 39.22, -1.539167, 1.7],
				[4377, 40.5, -1.539167, 2.5],
			],
		});
		fixture.componentInstance.setOrigin({
			name: 'Abengibre',
			latitude: 39.211417,
			longitude: -1.539167,
		});
		await fixture.whenStable();
		flushDetails();
		await fixture.whenStable();
		fixture.componentInstance.openStation(4375);
		await fixture.whenStable();
		http.expectOne('/api/stations/4375').flush(liveStation());
		await fixture.whenStable();
		expect(fixture.componentInstance.zone()?.rows.map((row) => row.point[0])).toEqual([4375, 4376]);
		expect(fixture.componentInstance.zone()?.label).toBe('a menos de 10 km');
		fixture.componentInstance.origin.set(null);
		await fixture.whenStable();
		flushDetails();
		await fixture.whenStable();
		expect(fixture.componentInstance.zone()?.label).toBe('a menos de 10 km de aquí');
	});

	it('opens the card of a shared link and frames the map on it', async () => {
		await TestBed.inject(Router).navigateByUrl('/?gasolinera=4375');
		const fixture = await create();
		http.expectOne('/api/stations/4375').flush(liveStation());
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('app-station-card h2').textContent).toBe(
			liveStation().name,
		);
		expect(fixture.componentInstance.target()?.[0]).toBe(4375);
		fixture.componentInstance.closeStation();
		await fixture.whenStable();
		expect(TestBed.inject(Router).url).toBe('/');
	});

	it('names the open card in the address so it can be shared', async () => {
		const fixture = await create();
		fixture.componentInstance.chooseStation(liveSnapshot.stations[0]);
		await fixture.whenStable();
		expect(TestBed.inject(Router).url).toBe('/?gasolinera=4375');
		http.expectOne('/api/stations/4375').flush(liveStation());
	});

	it('opens an electric site from the router query parameters', async () => {
		await TestBed.inject(Router).navigateByUrl('/?recarga=FAST');
		const fixture = await create();
		http.expectOne('/api/charging/sites').flush(chargingSnapshot);
		http.expectOne('/api/charging/sites/FAST').flush(chargingSite);
		await fixture.whenStable();
		expect(fixture.componentInstance.chargingSite()?.id).toBe('FAST');
		http.match((request) => request.url === '/api/charging/sites/summaries');
	});

	it('opens electric mode without a selected site', async () => {
		await TestBed.inject(Router).navigateByUrl('/?modo=recarga');
		const fixture = await create();
		http.expectOne('/api/charging/sites').flush(chargingSnapshot);
		await fixture.whenStable();
		expect(fixture.componentInstance.mode()).toBe('electric');
		http.match((request) => request.url === '/api/charging/sites/summaries');
	});

	it('preserves other query parameters when opening a station', async () => {
		await TestBed.inject(Router).navigateByUrl('/?source=bookmark');
		const fixture = await create();
		fixture.componentInstance.openStation(4375);
		await fixture.whenStable();
		http.expectOne('/api/stations/4375').flush(liveStation());
		expect(TestBed.inject(Router).parseUrl(TestBed.inject(Router).url).queryParams['source']).toBe(
			'bookmark',
		);
	});

	it('remembers the fuel the driver chose for the next visit', async () => {
		const fixture = await create();
		fixture.componentInstance.chooseFuel('GASOLINA_95_E5');
		expect(localStorage.getItem('fuel-insights-fuel')).toBe('GASOLINA_95_E5');
		await selectFuel(fixture, 'GASOLINA_95_E5');
		fixture.destroy();
		const next = TestBed.createComponent(MapPage);
		expect(next.componentInstance.selectedFuel()).toBe('GASOLINA_95_E5');
		next.destroy();
	});

	it('takes the driver to the map on a phone when a station is chosen from the board', async () => {
		vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width') }));
		const fixture = await create();
		const mapSlot = fixture.nativeElement.querySelector('.map-slot') as HTMLElement;
		mapSlot.scrollIntoView = vi.fn();
		const button = fixture.nativeElement.querySelector(
			'app-price-board app-cheapest-list li button',
		) as HTMLButtonElement;
		button.click();
		await fixture.whenStable();
		expect(mapSlot.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
		expect(fixture.componentInstance.stationId()).toBe(4375);
		http.expectOne('/api/stations/4375').flush(liveStation());
		vi.unstubAllGlobals();
	});

	it('lists the five cheapest inside the board and opens and closes their card without WebGL', async () => {
		const fixture = await create();
		const buttons = fixture.nativeElement.querySelectorAll(
			'app-price-board app-cheapest-list li button',
		);
		expect(buttons).toHaveLength(5);
		expect(fixture.nativeElement.querySelector('.list-slot app-cheapest-list')).toBeNull();
		expect(buttons[0].textContent).toContain('Nº 4375');
		buttons[0].focus();
		buttons[0].click();
		await fixture.whenStable();
		http.expectOne('/api/stations/4375').flush(liveStation());
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('app-station-card').textContent).toContain(
			'Abengibre',
		);
		const card = fixture.nativeElement.querySelector('.map-slot app-station-card');
		expect(card).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.list-slot app-station-card')).toBeNull();
		expect(card.textContent).toContain('1,829 €/l');
		expect(card.querySelector('.pill').textContent.trim()).toBe('1.ª más barata');
		expect(document.activeElement?.id).toBe('station-title');
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('app-station-card')).toBeNull();
		expect(document.activeElement).toBe(buttons[0]);
	});

	it('does not repeat the Ministry timestamp underneath the map', async () => {
		const fixture = await create();
		expect(fixture.nativeElement.querySelector('.map-slot > .data-note')).toBeNull();
	});

	it('chooses a town shows its radius and nearby title and clears back to the cheapest list', async () => {
		const fixture = await create();
		const input: HTMLInputElement = fixture.nativeElement.querySelector('[role=combobox]');
		input.value = 'abeng';
		input.dispatchEvent(new Event('input'));
		http.expectOne('/api/places').flush(samplePlaces);
		await fixture.whenStable();
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await fixture.whenStable();
		flushDetails();
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelectorAll('input[name=radius]')).toHaveLength(4);
		expect(fixture.nativeElement.querySelector('#cheapest-title').textContent).toBe(
			'9 gasolineras a menos de 10 km de Abengibre',
		);
		fixture.nativeElement.querySelector('[aria-label="Borrar búsqueda"]').click();
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('#cheapest-title').textContent).toBe(
			'Las 5 más baratas de la zona del mapa',
		);
		expect(fixture.componentInstance.origin()).toBeNull();
		expect(fixture.nativeElement.querySelectorAll('input[name=radius]')).toHaveLength(0);
		http.expectNone('/api/places');
	});

	it('widens an empty nearby search with the next-radius button', async () => {
		const fixture = await create();
		fixture.componentInstance.setOrigin({
			name: 'Tu ubicación',
			latitude: 39.15,
			longitude: -1.539167,
		});
		fixture.componentInstance.radius.set(5);
		await fixture.whenStable();
		const button = [...fixture.nativeElement.querySelectorAll('app-cheapest-list button')].find(
			(item: any) => item.textContent.includes('Ampliar a 10 km'),
		) as HTMLButtonElement;
		expect(button).toBeDefined();
		button.click();
		await fixture.whenStable();
		flushDetails();
		await fixture.whenStable();
		expect(fixture.componentInstance.radius()).toBe(10);
		expect(
			fixture.nativeElement.querySelectorAll('app-cheapest-list li button').length,
		).toBeGreaterThan(0);
		expect(fixture.nativeElement.querySelector('#cheapest-title').textContent).toContain(
			'de tu ubicación',
		);
	});

	it('shows a helpful empty state before the first snapshot', async () => {
		const fixture = await create(null);
		expect(fixture.nativeElement.textContent).toContain('Aún no hay precios actuales publicados');
		expect(fixture.nativeElement.textContent).not.toContain('POST /api');
	});

	it('does not fetch historical statistics on the map', async () => {
		const fixture = await create();
		http.expectNone(
			(request) =>
				request.url.startsWith('/api/stats/trend') ||
				request.url.startsWith('/api/stats/provinces'),
		);
		expect(fixture.nativeElement.querySelector('.trend-card')).toBeNull();
	});

	it('retries a failed current snapshot without requesting station prices again', async () => {
		const fixture = await create();
		fixture.componentInstance.retryCurrent();
		await fixture.whenStable();
		http.expectOne('/api/fuels').flush(liveFuels);
		http.expectOne('/api/areas').flush(liveAreas);
		http.expectOne('/api/stats/current').flush({}, { status: 500, statusText: 'Error' });
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('.board-slot [role="alert"]')).toBeNull();
		expect(fixture.componentInstance.current()).toEqual(liveCurrent);
		fixture.componentInstance.retryCurrent();
		await fixture.whenStable();
		http.expectOne('/api/fuels').flush(liveFuels);
		http.expectOne('/api/areas').flush(liveAreas);
		http.expectOne('/api/stats/current').flush(liveCurrent);
		await fixture.whenStable();
		expect(fixture.componentInstance.currentStatus()).toBe('ready');
		http.expectNone('/api/stations?fuel=GASOLEO_A');
	});

	it('refreshes the board and selected snapshot after fifteen minutes without clearing prices', async () => {
		const fixture = await create();
		now = 15 * 60_000;
		await vi.advanceTimersByTimeAsync(now);
		await fixture.whenStable();
		expect(fixture.componentInstance.current()).toEqual(liveCurrent);
		expect(fixture.componentInstance.snapshot()).toEqual(liveSnapshot);
		expect(fixture.componentInstance.currentStatus()).toBe('ready');
		expect(fixture.componentInstance.stationStatus()).toBe('ready');
		const updatedAt = '2026-10-29T14:00:00+01:00';
		http.expectOne('/api/stats/current').flush({ ...liveCurrent, updatedAt });
		http.expectOne('/api/stations?fuel=GASOLEO_A').flush({ ...liveSnapshot, updatedAt });
		await fixture.whenStable();
		expect(fixture.componentInstance.current()?.updatedAt).toBe(updatedAt);
		expect(fixture.componentInstance.snapshot()?.updatedAt).toBe(updatedAt);
		http.expectNone('/api/fuels');
		http.expectNone('/api/areas');
	});

	it('keeps the board map and open card when a background refresh fails', async () => {
		const fixture = await create();
		fixture.componentInstance.openStation(4375);
		await fixture.whenStable();
		http.expectOne('/api/stations/4375').flush(liveStation());
		await fixture.whenStable();
		const previousStation = fixture.componentInstance.station();
		now = 15 * 60_000;
		await vi.advanceTimersByTimeAsync(now);
		await fixture.whenStable();
		expect(fixture.componentInstance.station()).toEqual(previousStation);
		http.expectOne('/api/stats/current').flush({}, { status: 500, statusText: 'Error' });
		http.expectOne('/api/stations?fuel=GASOLEO_A').flush({}, { status: 500, statusText: 'Error' });
		http.expectOne('/api/stations/4375').flush({}, { status: 500, statusText: 'Error' });
		await fixture.whenStable();
		expect(fixture.componentInstance.current()).toEqual(liveCurrent);
		expect(fixture.componentInstance.snapshot()).toEqual(liveSnapshot);
		expect(fixture.componentInstance.station()).toEqual(previousStation);
		expect(fixture.componentInstance.cardError()).toBe(false);
		expect(fixture.componentInstance.currentStatus()).toBe('ready');
		expect(fixture.componentInstance.stationStatus()).toBe('ready');
		expect(fixture.nativeElement.querySelector('.board-slot [role="alert"]')).toBeNull();
	});

	it('refreshes when returning to a visible page after more than five minutes', async () => {
		const fixture = await create();
		const visibility = vi.spyOn(document, 'visibilityState', 'get');
		now = PRICE_CACHE_LIFETIME + 1;
		visibility.mockReturnValue('hidden');
		document.dispatchEvent(new Event('visibilitychange'));
		await fixture.whenStable();
		http.expectNone('/api/stats/current');
		visibility.mockReturnValue('visible');
		document.dispatchEvent(new Event('visibilitychange'));
		await fixture.whenStable();
		http.expectOne('/api/stats/current').flush(liveCurrent);
		http.expectOne('/api/stations?fuel=GASOLEO_A').flush(liveSnapshot);
		await fixture.whenStable();
		now += PRICE_CACHE_LIFETIME - 1;
		document.dispatchEvent(new Event('visibilitychange'));
		await fixture.whenStable();
		http.expectNone('/api/stats/current');
	});

	it('reuses a recently opened card while refreshing the board', async () => {
		const fixture = await create();
		now = 14 * 60_000;
		fixture.componentInstance.openStation(4375);
		await fixture.whenStable();
		http.expectOne('/api/stations/4375').flush(liveStation());
		await fixture.whenStable();
		now = 15 * 60_000;
		await vi.advanceTimersByTimeAsync(now);
		await fixture.whenStable();
		http.expectOne('/api/stats/current').flush(liveCurrent);
		http.expectOne('/api/stations?fuel=GASOLEO_A').flush(liveSnapshot);
		await fixture.whenStable();
		http.expectNone('/api/stations/4375');
	});

	it('removes refresh timers and visibility listeners on destruction', async () => {
		const fixture = await create();
		fixture.destroy();
		now = 15 * 60_000;
		await vi.advanceTimersByTimeAsync(now);
		vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
		document.dispatchEvent(new Event('visibilitychange'));
		http.expectNone('/api/stats/current');
	});

	it('switches to charging sites once, with their board, list and card, and back', async () => {
		const fixture = await create();
		const electric = [
			...fixture.nativeElement.querySelectorAll('.mode button'),
		][1] as HTMLButtonElement;
		electric.click();
		await fixture.whenStable();
		http.expectOne('/api/charging/sites').flush(chargingSnapshot);
		await fixture.whenStable();
		expect(electric.getAttribute('aria-checked')).toBe('true');
		expect(fixture.nativeElement.querySelector('app-charging-board')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('app-price-board')).toBeNull();
		expect(fixture.nativeElement.querySelector('.trend-card')).toBeNull();
		http.match((request) => request.url === '/api/charging/sites/summaries');
		fixture.componentInstance.openCharging(chargingSnapshot.sites[2]);
		await fixture.whenStable();
		http.expectOne('/api/charging/sites/FAST').flush(chargingSite);
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('app-charging-card h2').textContent).toBe(
			'Iberdrola',
		);
		fixture.componentInstance.setMode('fuel');
		await fixture.whenStable();
		expect(fixture.componentInstance.chargingId()).toBeNull();
		fixture.componentInstance.setMode('electric');
		await fixture.whenStable();
		http.expectNone('/api/charging/sites');
		http.match((request) => request.url === '/api/charging/sites/summaries');
	});
});
