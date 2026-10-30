import { of, Subject } from 'rxjs';
import { PricesApi } from './prices-api';
import { BoundaryLoader } from './area-loader';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { StationMap, MAP_COLOURS } from './station-map';
import { liveSnapshot } from './live-fixture';
import { chargingSnapshot } from './charging-fixture';

const mock = vi.hoisted(() => ({
	listeners: new Map<string, (...args: any[]) => void>(),
	setData: vi.fn(),
	circleData: vi.fn(),
	areaData: vi.fn(),
	chargingData: vi.fn(),
	focusData: vi.fn(),
	popupContent: null as HTMLElement | null,
	addLayer: vi.fn(),
	remove: vi.fn(),
	flyTo: vi.fn(),
	jumpTo: vi.fn(),
	resize: vi.fn(),
	queryRenderedFeatures: vi.fn(() => [] as any[]),
	getZoom: vi.fn(() => 12),
	fitBounds: vi.fn(),
	setWorkerUrl: vi.fn(),
	setFilter: vi.fn(),
	setLayoutProperty: vi.fn(),
	setPaintProperty: vi.fn(),
	setStyle: vi.fn(),
	options: vi.fn(),
}));

const boundaries = {
	load: vi.fn(async () => ({
		type: 'FeatureCollection',
		features: [
			{
				type: 'Feature',
				id: '28127',
				properties: { name: 'Rozas de Madrid, Las' },
				geometry: {
					type: 'Polygon',
					coordinates: [
						[
							[-4, 40],
							[-3, 40],
							[-3, 41],
							[-4, 40],
						],
					],
				},
			},
		],
	})),
};
vi.mock('maplibre-gl', () => ({
	setWorkerUrl: mock.setWorkerUrl,
	NavigationControl: class {},
	AttributionControl: class {},
	Popup: class {
		setLngLat() {
			return this;
		}
		setDOMContent(content: HTMLElement) {
			mock.popupContent = content;
			return this;
		}
		addTo() {
			return this;
		}
		remove() {}
	},
	Map: class {
		constructor(options: unknown) {
			mock.options(options);
		}
		addControl() {}
		removeControl() {}
		getStyle() {
			return {
				layers: [
					{ id: 'background', type: 'background' },
					{ id: 'place-label', type: 'symbol' },
				],
			};
		}
		on(
			event: string,
			layerOrCallback: string | ((...args: any[]) => void),
			callback?: (...args: any[]) => void,
		) {
			mock.listeners.set(event, callback ?? (layerOrCallback as (...args: any[]) => void));
		}
		once(event: string, callback: (...args: any[]) => void) {
			mock.listeners.set(event, callback);
		}
		addSource() {}
		addLayer = mock.addLayer;
		getSource(id: string) {
			return {
				setData:
					id === 'circle-area'
						? mock.circleData
						: id === 'areas'
							? mock.areaData
							: id === 'charging'
								? mock.chargingData
								: id === 'focus-area'
									? mock.focusData
									: mock.setData,
			};
		}
		getCanvas() {
			return { style: { cursor: '' } };
		}
		getContainer() {
			return document.createElement('div');
		}
		getBounds() {
			return { getWest: () => -2, getEast: () => 0, getSouth: () => 38, getNorth: () => 41 };
		}
		remove = mock.remove;
		flyTo = mock.flyTo;
		jumpTo = mock.jumpTo;
		resize = mock.resize;
		getZoom = mock.getZoom;
		queryRenderedFeatures = mock.queryRenderedFeatures;
		fitBounds = mock.fitBounds;
		setFilter = mock.setFilter;
		setLayoutProperty = mock.setLayoutProperty;
		getPaintProperty(_layer: string, property: string) {
			return property === 'text-color' ? '#333333' : property === 'text-halo-color' ? '#0c0c0c' : 1;
		}
		setPaintProperty = mock.setPaintProperty;
		setStyle = mock.setStyle;
	},
}));

describe('StationMap', () => {
	it('preserves the camera when reloading the map style', async () => {
		const fixture = await create();
		mock.fitBounds.mockClear();
		fixture.componentInstance.setMapStyle('light');
		mock.listeners.get('style.load')!();
		expect(mock.fitBounds).not.toHaveBeenCalled();
	});

	it('shows kilogram units in both legend layouts', async () => {
		const fixture = await create();
		fixture.componentRef.setInput('snapshot', {
			...liveSnapshot,
			fuel: { code: 'GNC', name: 'Gas natural comprimido', unit: 'kg', main: false },
		});
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('.legend ol').textContent).toContain('€/kg');
		expect(fixture.nativeElement.querySelector('.scale-ends').textContent).toContain('€/kg');
	});

	it('discards municipality responses after returning to stations', async () => {
		const fixture = await create();
		const response = new Subject<import('./area-functions').AreaRow[]>();
		vi.spyOn(TestBed.inject(PricesApi), 'getMunicipalities').mockReturnValue(response);
		fixture.componentInstance.setView('municipalities');
		await fixture.whenStable();
		fixture.componentInstance.setView('stations');
		await fixture.whenStable();
		response.next([['Las Rozas de Madrid', '28', 1.8, 12]]);
		response.complete();
		await fixture.whenStable();
		expect(fixture.componentInstance.areaRows()).toEqual([]);
		expect(mock.areaData.mock.calls.at(-1)![0].features).toHaveLength(0);
	});

	it('persists map style and restores overlays using the light palette', async () => {
		const fixture = await create();
		const light: HTMLButtonElement = fixture.nativeElement.querySelector(
			'[aria-label="Estilo del mapa"] button:last-child',
		);
		light.click();
		await fixture.whenStable();
		expect(localStorage.getItem('fuel-insights-map-style')).toBe('light');
		expect(mock.setStyle).toHaveBeenCalledWith('https://tiles.openfreemap.org/styles/positron', {
			diff: false,
		});
		mock.listeners.get('style.load')!();
		const stationLayer = mock.addLayer.mock.calls
			.filter(([layer]) => layer.id === 'stations')
			.at(-1)![0];
		expect(stationLayer.paint['circle-color']).toContain('#16a34a');
		expect(stationLayer.paint['circle-stroke-color']).toBe('rgba(0,0,0,0.6)');
	});
	it('loads municipality boundaries on demand and hides station dots', async () => {
		const fixture = await create();
		expect(boundaries.load).not.toHaveBeenCalled();
		fixture.nativeElement.querySelectorAll('[role="radio"]')[1].click();
		await fixture.whenStable();
		await vi.waitFor(() => expect(mock.areaData.mock.calls.at(-1)?.[0].features).toHaveLength(1));
		expect(boundaries.load).toHaveBeenCalledTimes(1);
		expect(mock.setLayoutProperty).toHaveBeenCalledWith('stations', 'visibility', 'none');
		expect(mock.areaData.mock.calls.at(-1)![0].features[0].properties.averagePrice).toBe(1.8);
	});
	it('returns to the station dots when a station is chosen from an area view', async () => {
		const fixture = await create();
		fixture.componentInstance.setView('provinces');
		await fixture.whenStable();
		fixture.componentRef.setInput('target', liveSnapshot.stations[0]);
		await fixture.whenStable();
		expect(fixture.componentInstance.view()).toBe('stations');
		expect(mock.setLayoutProperty).toHaveBeenLastCalledWith('area-outline', 'visibility', 'none');
	});
	it('outlines place names over coloured areas and restores them with the stations', async () => {
		const fixture = await create();
		fixture.componentInstance.setView('municipalities');
		await fixture.whenStable();
		expect(mock.setPaintProperty).toHaveBeenCalledWith('place-label', 'text-color', '#ffffff');
		expect(mock.setPaintProperty).toHaveBeenCalledWith('place-label', 'text-halo-width', 1.6);
		mock.setPaintProperty.mockClear();
		fixture.componentInstance.setView('stations');
		await fixture.whenStable();
		expect(mock.setPaintProperty).toHaveBeenCalledWith('place-label', 'text-color', '#333333');
		expect(mock.setPaintProperty).toHaveBeenCalledWith('place-label', 'text-halo-width', 1);
	});
	it('runs town search from an area popup button', async () => {
		const fixture = await create();
		const search = vi.fn();
		fixture.componentInstance.areaSearch.subscribe(search);
		fixture.componentInstance.setView('municipalities');
		await fixture.whenStable();
		await vi.waitFor(() => expect(mock.areaData.mock.calls.at(-1)?.[0].features).toHaveLength(1));
		mock.queryRenderedFeatures.mockReturnValue(mock.areaData.mock.calls.at(-1)![0].features);
		mock.listeners.get('click')!({ point: { x: 1, y: 1 }, lngLat: { lng: -3.5, lat: 40.5 } });
		mock.popupContent!.querySelector('button')!.click();
		await vi.waitFor(() =>
			expect(search).toHaveBeenCalledWith({
				name: 'Las Rozas de Madrid',
				latitude: 40.49,
				longitude: -3.87,
			}),
		);
		expect(fixture.componentInstance.view()).toBe('stations');
	});
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				{ provide: BoundaryLoader, useValue: boundaries },
				{
					provide: PricesApi,
					useValue: {
						getMunicipalities: () => of([['Las Rozas de Madrid', '28', 1.8, 12]]),
						getPlaces: () => of([['Las Rozas de Madrid', '28', 40.49, -3.87, 12]]),
					},
				},
			],
		});
		localStorage.clear();
		mock.listeners.clear();
		vi.clearAllMocks();
		mock.getZoom.mockReturnValue(12);
		mock.queryRenderedFeatures.mockReturnValue([]);
	});
	afterEach(() => vi.unstubAllGlobals());

	async function create(load = true) {
		const fixture = TestBed.createComponent(StationMap);
		fixture.componentRef.setInput('snapshot', liveSnapshot);
		await fixture.whenStable();
		await vi.waitFor(() => expect(mock.listeners.has('style.load')).toBe(true));
		if (load) mock.listeners.get('style.load')!();
		return fixture;
	}

	it('frames desktop selections at zoom fourteen clear of the card and retains closer zooms', async () => {
		vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width') }));
		const fixture = await create();
		fixture.componentRef.setInput('target', liveSnapshot.stations[0]);
		await fixture.whenStable();
		expect(mock.flyTo).toHaveBeenLastCalledWith(
			expect.objectContaining({
				center: [-1.539167, 39.211417],
				zoom: 14,
				padding: expect.objectContaining({ left: 392, right: 16, bottom: 16 }),
				retainPadding: false,
			}),
		);
		mock.getZoom.mockReturnValue(16);
		fixture.componentRef.setInput('target', liveSnapshot.stations[1]);
		await fixture.whenStable();
		expect(mock.flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 16 }));
	});

	it('jumps with reduced motion and uses the measured mobile sheet height', async () => {
		vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduced-motion') }));
		const fixture = await create();
		fixture.componentRef.setInput('cardSize', { width: 340, height: 280 });
		fixture.componentRef.setInput('target', liveSnapshot.stations[0]);
		await fixture.whenStable();
		expect(mock.jumpTo).toHaveBeenLastCalledWith(
			expect.objectContaining({
				zoom: 14,
				padding: expect.objectContaining({ left: 16, right: 16, bottom: 296 }),
			}),
		);
		expect(mock.flyTo).not.toHaveBeenCalled();
	});

	it('resizes the canvas when its container changes and disconnects on destroy', async () => {
		const disconnect = vi.fn(),
			observe = vi.fn();
		let notify!: () => void;
		vi.stubGlobal(
			'ResizeObserver',
			class {
				constructor(callback: () => void) {
					notify = callback;
				}
				observe = observe;
				disconnect = disconnect;
			},
		);
		const fixture = await create();
		expect(observe).toHaveBeenCalledWith(fixture.nativeElement.querySelector('.map-canvas'));
		notify();
		expect(mock.resize).toHaveBeenCalledOnce();
		fixture.destroy();
		expect(disconnect).toHaveBeenCalledOnce();
	});

	it('selects a dot and dismisses the card only on an empty map click', async () => {
		const fixture = await create();
		const choose = vi.fn(),
			dismiss = vi.fn();
		fixture.componentInstance.choose.subscribe(choose);
		fixture.componentInstance.dismiss.subscribe(dismiss);
		mock.queryRenderedFeatures.mockReturnValue([{ properties: { id: 4375 } }]);
		mock.listeners.get('click')!({ point: { x: 100, y: 100 } });
		expect(choose).toHaveBeenCalledWith(4375);
		expect(dismiss).not.toHaveBeenCalled();
		mock.queryRenderedFeatures.mockReturnValue([]);
		mock.listeners.get('click')!({ point: { x: 110, y: 110 } });
		expect(dismiss).toHaveBeenCalledOnce();
	});

	it('uses the same origin worker and renders price quintiles with Q1 on top', async () => {
		const fixture = await create();
		expect(mock.setWorkerUrl).toHaveBeenCalledWith(
			new URL('maplibre-gl-worker.mjs', document.baseURI).href,
		);
		expect(mock.addLayer).toHaveBeenCalledWith(
			expect.objectContaining({ layout: { 'circle-sort-key': ['-', 4, ['get', 'quintile']] } }),
		);
		const collection = mock.setData.mock.calls.at(-1)![0];
		expect(collection.features).toHaveLength(12);
		expect(collection.features[0].geometry.coordinates).toEqual([-1.539167, 39.211417]);
		expect(collection.features[0].properties.quintile).toBe(0);
		expect(collection.features.at(-1).properties.quintile).toBe(4);
		expect(MAP_COLOURS).toHaveLength(5);
		fixture.destroy();
		expect(mock.remove).toHaveBeenCalled();
	});

	it('keeps controls and emits bounds when the map fails before loading', async () => {
		const fixture = await create(false);
		const bounds = vi.fn();
		fixture.componentInstance.boundsChange.subscribe(bounds);
		mock.listeners.get('error')!();
		mock.listeners.get('moveend')!();
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain('El mapa no se pudo cargar');
		expect(bounds).toHaveBeenCalledWith({ west: -2, east: 0, south: 38, north: 41 });
	});

	it('does not label a loaded map as failed after a tile error', async () => {
		const fixture = await create();
		mock.listeners.get('error')!();
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('.map-error')).toBeNull();
	});

	it('clears a startup error when the map eventually loads', async () => {
		const fixture = await create(false);
		mock.listeners.get('error')!();
		await fixture.whenStable();
		expect(fixture.componentInstance.failed()).toBe(true);
		mock.listeners.get('style.load')!();
		await fixture.whenStable();
		expect(fixture.componentInstance.failed()).toBe(false);
	});

	it('highlights the selected station and removes the ring when the card closes', async () => {
		const fixture = await create();
		fixture.componentRef.setInput('selectedId', 4375);
		await fixture.whenStable();
		expect(mock.addLayer).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'selected-station',
				paint: {
					'circle-color': 'rgba(0,0,0,0)',
					'circle-radius': 10,
					'circle-stroke-color': '#ffffff',
					'circle-stroke-width': 2,
				},
			}),
		);
		expect(mock.setFilter).toHaveBeenLastCalledWith('selected-station', [
			'==',
			['get', 'id'],
			4375,
		]);
		fixture.componentRef.setInput('selectedId', null);
		await fixture.whenStable();
		expect(mock.setFilter).toHaveBeenLastCalledWith('selected-station', ['==', ['get', 'id'], -1]);
	});

	it('keeps icon controls labelled and full ranges available alongside the compact legend', async () => {
		const fixture = await create();
		expect(mock.options).toHaveBeenCalledWith(
			expect.objectContaining({ attributionControl: { compact: true } }),
		);
		const page: HTMLElement = fixture.nativeElement;
		for (const label of ['Mi ubicación', 'Ver toda España']) {
			const button = page.querySelector(`button[aria-label="${label}"]`)!;
			expect(button.getAttribute('title')).toBe(label);
			expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
		}
		expect(page.querySelectorAll('.legend ol li')).toHaveLength(5);
		expect(page.querySelectorAll('.swatch-bar span')).toHaveLength(5);
		expect(page.querySelector('.compact-scale')?.textContent).toContain('1,729 €/l');
		expect(page.querySelector('.compact-scale')?.textContent).toContain('Más cara');
	});

	it('delegates a location tap and displays the parent location error', async () => {
		const fixture = await create();
		const locate = vi.fn();
		fixture.componentInstance.locate.subscribe(locate);
		expect(locate).not.toHaveBeenCalled();
		fixture.nativeElement.querySelector('[aria-label="Mi ubicación"]').click();
		expect(locate).toHaveBeenCalledOnce();
	});
	it('clears dots while a different fuel loads', async () => {
		const fixture = await create();
		fixture.componentRef.setInput('snapshot', null);
		await fixture.whenStable();
		expect(mock.setData).toHaveBeenLastCalledWith({ type: 'FeatureCollection', features: [] });
	});

	it('draws the search circle dims outside stations and restores the map when cleared', async () => {
		const fixture = await create();
		fixture.componentRef.setInput('origin', {
			name: 'Abengibre',
			latitude: 39.211417,
			longitude: -1.539167,
		});
		fixture.componentRef.setInput('radius', 5);
		await fixture.whenStable();
		expect(mock.circleData.mock.calls.at(-1)![0].features[0].geometry.type).toBe('Polygon');
		expect(mock.circleData.mock.calls.at(-1)![0].features[1].geometry.type).toBe('Point');
		expect(mock.fitBounds).toHaveBeenLastCalledWith(expect.any(Array), {
			padding: expect.objectContaining({ left: 24, right: 56 }),
		});
		const features = mock.setData.mock.calls.at(-1)![0].features;
		expect(features[0].properties.opacity).toBe(1);
		expect(features.at(-1).properties.opacity).toBe(0.25);
		fixture.componentRef.setInput('origin', null);
		await fixture.whenStable();
		expect(mock.circleData).toHaveBeenLastCalledWith({ type: 'FeatureCollection', features: [] });
		expect(
			mock.setData.mock.calls
				.at(-1)![0]
				.features.every((feature: any) => feature.properties.opacity === 1),
		).toBe(true);
	});

	it('shows charging sites by power instead of fuel stations and opens the one tapped', async () => {
		const fixture = await create();
		const chosen = vi.fn();
		fixture.componentInstance.chooseCharging.subscribe(chosen);
		fixture.componentRef.setInput('electric', true);
		fixture.componentRef.setInput('charging', chargingSnapshot);
		fixture.componentRef.setInput('minBand', 2);
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('[aria-label="Vista del mapa"]')).toBeNull();
		expect(fixture.nativeElement.textContent).toContain('Puntos de recarga por potencia máxima');
		expect(mock.setLayoutProperty).toHaveBeenCalledWith('stations', 'visibility', 'none');
		expect(mock.setLayoutProperty).toHaveBeenCalledWith('charging-points', 'visibility', 'visible');
		expect(mock.setFilter).toHaveBeenCalledWith('charging-points', ['>=', ['get', 'band'], 2]);
		const sites = mock.chargingData.mock.calls.at(-1)![0].features;
		expect(sites).toHaveLength(5);
		expect(sites[4].properties).toEqual({ id: 'ULTRA', band: 4, label: '350 kW' });
		mock.queryRenderedFeatures.mockReturnValue([{ properties: { id: 'FAST' } }]);
		mock.listeners.get('click')!({ point: { x: 1, y: 1 }, lngLat: { lng: -3.72, lat: 40.32 } });
		expect(chosen).toHaveBeenCalledWith(chargingSnapshot.sites[2]);
	});

	it('outlines the province chosen for the board', async () => {
		const fixture = await create();
		fixture.componentRef.setInput('focusArea', '28');
		await fixture.whenStable();
		await vi.waitFor(() => expect(mock.focusData).toHaveBeenCalled());
		expect(boundaries.load).toHaveBeenCalledWith('provinces');
	});

	it('hides the fuel stations as soon as the electric mode starts, before its sites arrive', async () => {
		const fixture = await create();
		mock.setLayoutProperty.mockClear();
		fixture.componentRef.setInput('electric', true);
		await fixture.whenStable();
		expect(mock.setLayoutProperty).toHaveBeenCalledWith('stations', 'visibility', 'none');
		expect(fixture.nativeElement.textContent).toContain('Cargando puntos de recarga');
		const chosen = vi.fn();
		fixture.componentInstance.choose.subscribe(chosen);
		mock.queryRenderedFeatures.mockReturnValue([{ properties: { id: 4375 } }]);
		mock.listeners.get('click')!({ point: { x: 1, y: 1 }, lngLat: { lng: -1.5, lat: 39.2 } });
		expect(chosen).not.toHaveBeenCalled();
	});
});
