import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { FeatureCollection, Feature, Geometry } from 'geojson';
import { AreaRow, AreaView, joinAreas, areaBounds, municipalityKeys } from './area-functions';
import { BoundaryLoader } from './area-loader';
import { PricesApi } from './prices-api';
import { price } from './price-format';
import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	ElementRef,
	inject,
	input,
	output,
	signal,
	untracked,
	viewChild,
} from '@angular/core';
import type { GeoJSONSource, Map as LibreMap } from 'maplibre-gl';
import { decimal, freshness, quintileBreaks } from './price-format';
import {
	ChargingPoint,
	ChargingSnapshot,
	CurrentFuel,
	SearchOrigin,
	StationPoint,
	StationSnapshot,
	ViewBounds,
} from './price-models';
import { circlePolygon } from './place-functions';
import { TRAFFIC_LIGHT } from './map-colours';
import {
	chargingFeatures,
	MAP_SOURCES,
	stationFeatures,
	topLayers,
	underLabelLayers,
} from './map-layers';
import {
	chargingFreshness,
	LIGHT_POWER_COLOURS,
	POWER_BANDS,
	POWER_COLOURS,
} from './charging-functions';

// Prices: the cheapest class green, the most expensive red.
export const MAP_COLOURS = TRAFFIC_LIGHT;
export const LIGHT_MAP_COLOURS = MAP_COLOURS;
export const PENINSULA_BOUNDS: ViewBounds = { west: -9.6, south: 35.7, east: 4.5, north: 43.9 };

@Component({
	selector: 'app-station-map',
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<section
			aria-label="Mapa de gasolineras"
			[style.background]="mapStyle() === 'dark' ? '#0c0c0c' : '#f2f3f0'"
		>
			<div #canvas class="map-canvas"></div>
			<div class="controls">
				@if (!electric()) {
					<div
						class="segments views"
						role="radiogroup"
						aria-label="Vista del mapa"
						(keydown)="navigateView($event)"
					>
						@for (option of viewOptions; track option.code) {
							<button
								role="radio"
								[attr.aria-checked]="view() === option.code"
								[tabIndex]="view() === option.code ? 0 : -1"
								(click)="setView(option.code)"
							>
								{{ option.label }}
							</button>
						}
					</div>
				}
				<div class="segments" role="group" aria-label="Estilo del mapa">
					<button [attr.aria-pressed]="mapStyle() === 'dark'" (click)="setMapStyle('dark')">
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z" /></svg
						>Oscuro
					</button>
					<button [attr.aria-pressed]="mapStyle() === 'light'" (click)="setMapStyle('light')">
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<circle cx="12" cy="12" r="4" />
							<path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12l2 2M4 20l2-2M18 6l2-2" /></svg
						>Claro
					</button>
				</div>
				<button (click)="locate.emit()" aria-label="Mi ubicación" title="Mi ubicación">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<circle cx="12" cy="12" r="6" />
						<path d="M12 2v5m0 10v5M2 12h5m10 0h5" />
					</svg>
				</button>
				<button (click)="canaries()">Canarias</button>
				<button (click)="reset()" aria-label="Ver toda España" title="Ver toda España">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6" />
					</svg>
				</button>
			</div>
			@if (areasLoading()) {
				<p class="map-error" role="status">
					Cargando {{ view() === 'municipalities' ? 'municipios' : 'provincias' }}…
				</p>
			}
			@if (areasError()) {
				<p class="map-error" role="alert">
					No se pudieron cargar las áreas. <button (click)="refreshAreas()">Reintentar</button>
				</p>
			}
			@if (failed()) {
				<p class="map-error" role="alert">
					El mapa no se pudo cargar. Puedes consultar la lista de gasolineras.
				</p>
			}
			<div class="legend">
				@if (electric()) {
					<strong>Puntos de recarga por potencia máxima</strong>
					<ol aria-label="Potencia de menor a mayor">
						@for (band of powerBands; track band.name) {
							<li [class.off]="$index < minBand()">
								<span [style.background]="powerColours()[$index]" aria-hidden="true"></span
								>{{ band.name }}<br />{{ band.range }}
								@if ($index < minBand()) {
									<span class="visually-hidden">, oculta en el mapa</span>
								}
							</li>
						}
					</ol>
					<div class="compact-scale" aria-hidden="true">
						<div class="swatch-bar">
							@for (colour of powerColours(); track colour) {
								<span [style.background]="colour"></span>
							}
						</div>
						<div class="scale-ends"><span>Lenta</span><span>Ultrarrápida</span></div>
					</div>
					@if (charging(); as ev) {
						<p>{{ chargingFreshness(ev.updatedAt) }}</p>
					} @else {
						<p>Cargando puntos de recarga…</p>
					}
				} @else if (snapshot(); as data) {
					<strong
						>{{ data.fuel.name
						}}{{
							view() === 'stations'
								? ' por gasolinera'
								: view() === 'municipalities'
									? ', media por municipio'
									: ', media por provincia'
						}}</strong
					>
					@if (extents()) {
						<ol aria-label="Precio de menor a mayor">
							@for (range of ranges(); track $index) {
								<li>
									<span [style.background]="colours()[$index]" aria-hidden="true"></span>{{ range }}
								</li>
							}
						</ol>
						<div class="compact-scale" aria-hidden="true">
							<div class="swatch-bar">
								@for (colour of colours(); track colour) {
									<span [style.background]="colour"></span>
								}
							</div>
							<div class="scale-ends">
								<span>{{ decimal(extents()!.min) }} €/{{ data.fuel.unit }}<br />Más barata</span
								><span>{{ decimal(extents()!.max) }} €/{{ data.fuel.unit }}<br />Más cara</span>
							</div>
						</div>
					} @else {
						<p>Sin gasolineras con precio para este carburante.</p>
					}
					<p>{{ freshness(data.updatedAt) }}</p>
				}
			</div>
		</section>
	`,
	styles: `
		:host {
			display: block;
			min-width: 0;
			height: 100%;
		}
		section {
			height: 100%;
			position: relative;
			background: #0c0c0c;
			color: #e8eaed;
			overflow: hidden;
			border-radius: 12px;
		}
		.map-canvas {
			position: absolute;
			inset: 0;
		}
		.controls {
			position: absolute;
			top: 12px;
			left: 12px;
			right: 48px;
			display: flex;
			gap: 6px;
			flex-wrap: wrap;
		}
		.views {
			flex-basis: 100%;
		}
		.segments {
			display: flex;
			gap: 0;
		}
		.segments button[aria-checked='true'],
		.segments button[aria-pressed='true'] {
			background: var(--panel-ink);
			color: var(--panel);
		}
		button {
			min-width: 44px;
			min-height: 44px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
			font-size: 14px;
			background: var(--panel);
			color: var(--panel-ink);
			border-color: var(--panel-ink-2);
			padding: 6px 10px;
		}
		.controls svg {
			width: 22px;
			height: 22px;
			fill: none;
			stroke: currentColor;
			stroke-width: 2;
		}
		.compact-scale {
			display: none;
		}
		@media (max-width: 479px) {
			.legend ol {
				position: absolute;
				width: 1px;
				height: 1px;
				padding: 0;
				margin: -1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
				border: 0;
			}
			.compact-scale {
				display: block;
				margin-top: 6px;
			}
			.swatch-bar {
				display: flex;
				height: 6px;
			}
			.swatch-bar span {
				flex: 1;
			}
			.scale-ends {
				display: flex;
				justify-content: space-between;
				margin-top: 4px;
				font-variant-numeric: tabular-nums;
			}
			.scale-ends span:last-child {
				text-align: right;
			}
		}
		.legend {
			position: absolute;
			bottom: 34px;
			left: 12px;
			right: 12px;
			padding: 10px;
			background: var(--panel);
			color: var(--panel-ink);
			border-radius: 8px;
			font-size: 12px;
			pointer-events: none;
		}
		.legend strong {
			font-size: 14px;
		}
		ol {
			display: flex;
			list-style: none;
			gap: 8px;
			margin: 6px 0;
			padding: 0;
		}
		li {
			flex: 1;
			font-variant-numeric: tabular-nums;
		}
		li span {
			display: block;
			height: 6px;
			margin-bottom: 4px;
		}
		li.off span {
			opacity: 0.3;
		}
		p {
			margin: 4px 0;
		}
		.map-error {
			position: absolute;
			top: 172px;
			left: 16px;
			right: 16px;
			padding: 12px;
			background: var(--panel);
		}
		@media (min-width: 1024px) {
			section {
				height: calc(100svh - 32px);
			}
		}
	`,
})
export class StationMap {
	private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
	readonly snapshot = input<StationSnapshot | null>(null);
	// Where to frame the map: a station or a charging site, by its coordinates.
	readonly target = input<StationPoint | ChargingPoint | null>(null);
	// Charging sites instead of fuel stations: the electric mode. The fuel views give way to one layer by power.
	// The mode is its own input: while the sites load, or if they fail, the map must not show fuel stations.
	readonly electric = input(false);
	readonly charging = input<ChargingSnapshot | null>(null);
	readonly minBand = input(0);
	readonly selectedCharging = input<string | null>(null);
	readonly chooseCharging = output<ChargingPoint>();
	readonly powerBands = POWER_BANDS;
	readonly powerColours = computed(() =>
		this.mapStyle() === 'dark' ? POWER_COLOURS : LIGHT_POWER_COLOURS,
	);
	readonly chargingFreshness = chargingFreshness;
	readonly selectedId = input<number | null>(null);
	readonly cardSize = input({ width: 360, height: 300 });
	readonly dismiss = output<void>();
	readonly origin = input<SearchOrigin | null>(null);
	readonly radius = input(10);
	readonly locate = output<void>();
	readonly boundsChange = output<ViewBounds>();
	readonly choose = output<number>();
	readonly failed = signal(false);
	readonly currentFuel = input<CurrentFuel | null>(null);
	readonly areaSearch = output<SearchOrigin>();
	// A province chosen from its popup: the board describes it and the map outlines it.
	readonly provinceFocus = output<string>();
	readonly focusArea = input<string | null>(null);
	readonly mapStyle = signal<'dark' | 'light'>(this.savedStyle());
	readonly view = signal<AreaView>('stations');
	readonly viewOptions: { code: AreaView; label: string }[] = [
		{ code: 'stations', label: 'Gasolineras' },
		{ code: 'municipalities', label: 'Municipios' },
		{ code: 'provinces', label: 'Provincias' },
	];
	readonly colours = computed(() => (this.mapStyle() === 'dark' ? MAP_COLOURS : LIGHT_MAP_COLOURS));
	readonly areasLoading = signal(false);
	readonly areasError = signal(false);
	readonly areaRows = signal<AreaRow[]>([]);
	private readonly api = inject(PricesApi);
	private readonly boundaries = inject(BoundaryLoader);
	private areaData: FeatureCollection | null = null;
	private areaSequence = 0;
	private focusSequence = 0;
	private popup?: import('maplibre-gl').Popup;
	private ignAttribution?: import('maplibre-gl').AttributionControl;
	private ignVisible = false;
	private labelPaint = new Map<
		string,
		NonNullable<import('maplibre-gl').SymbolLayerSpecification['paint']>
	>();
	private popupClass?: typeof import('maplibre-gl').Popup;
	private savedStyle(): 'dark' | 'light' {
		if (!this.browser) return 'dark';
		try {
			return localStorage.getItem('fuel-insights-map-style') === 'light' ? 'light' : 'dark';
		} catch {
			return 'dark';
		}
	}
	setMapStyle(style: 'dark' | 'light'): void {
		if (!this.browser) return;
		if (style === this.mapStyle()) return;
		this.mapStyle.set(style);
		try {
			localStorage.setItem('fuel-insights-map-style', style);
		} catch {}
		this.popup?.remove();
		this.loaded = false;
		this.labelPaint.clear();
		this.map?.setStyle(
			'https://tiles.openfreemap.org/styles/' + (style === 'dark' ? 'dark' : 'positron'),
			{ diff: false },
		);
	}
	setView(view: AreaView): void {
		this.popup?.remove();
		if (view !== 'stations') this.dismiss.emit();
		this.view.set(view);
	}
	navigateView(event: KeyboardEvent): void {
		const index = this.viewOptions.findIndex((option) => option.code === this.view());
		const offsets: Record<string, number> = {
			ArrowRight: 1,
			ArrowDown: 1,
			ArrowLeft: -1,
			ArrowUp: -1,
		};
		if (!(event.key in offsets) && event.key !== 'Home' && event.key !== 'End') return;
		event.preventDefault();
		const next =
			event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + offsets[event.key] + 3) % 3;
		this.setView(this.viewOptions[next].code);
		(event.currentTarget as HTMLElement)
			.querySelectorAll<HTMLButtonElement>('button')
			[next].focus();
	}
	async refreshAreas(): Promise<void> {
		const view = this.view(),
			fuel = this.snapshot()?.fuel.code;
		const sequence = ++this.areaSequence;
		this.areaData = null;
		this.areaRows.set([]);
		this.areasError.set(false);
		this.updateAreas();
		if (view === 'stations' || !fuel) {
			this.areasLoading.set(false);
			return;
		}
		this.areasLoading.set(true);
		try {
			const [boundaries, rows] = await Promise.all([
				this.boundaries.load(view),
				view === 'municipalities'
					? firstValueFrom(this.api.getMunicipalities(fuel))
					: Promise.resolve(
							(this.currentFuel()?.provinces ?? []).map(
								(row) =>
									[row.provinceId, row.provinceId, row.averagePrice, row.stations] as AreaRow,
							),
						),
			]);
			if (this.destroyed || sequence !== this.areaSequence) return;
			this.areaRows.set(rows);
			this.areaData = joinAreas(boundaries, rows, view === 'provinces');
			this.updateAreas();
		} catch {
			if (sequence === this.areaSequence) this.areasError.set(true);
		} finally {
			if (sequence === this.areaSequence) this.areasLoading.set(false);
		}
	}
	private updateAreas(): void {
		if (!this.loaded || !this.map) return;
		const visible = this.view() === 'stations';
		const electric = this.electric();
		if (this.ignAttribution && this.ignVisible === visible) {
			if (visible) this.map.removeControl(this.ignAttribution);
			else this.map.addControl(this.ignAttribution, 'bottom-right');
			this.ignVisible = !visible;
		}
		for (const id of ['circle-fill', 'circle-outline', 'circle-center'])
			this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
		for (const id of ['stations', 'station-labels', 'selected-station'])
			this.map.setLayoutProperty(id, 'visibility', visible && !electric ? 'visible' : 'none');
		for (const id of ['charging-points', 'charging-labels', 'selected-charging'])
			this.map.setLayoutProperty(id, 'visibility', electric ? 'visible' : 'none');
		const source = this.map.getSource('areas') as GeoJSONSource | undefined;
		source?.setData(this.areaData ?? { type: 'FeatureCollection', features: [] });
		this.map.setLayoutProperty('area-fill', 'visibility', visible ? 'none' : 'visible');
		this.map.setLayoutProperty('area-outline', 'visibility', visible ? 'none' : 'visible');
		this.contrastLabels(!visible);
	}

	// The base style draws its names for a plain background (dark grey on the dark map). Over coloured towns they
	// need a strong outline: white text on a black halo on the dark map, the reverse on the light one.
	private contrastLabels(onColour: boolean): void {
		const map = this.map;
		if (!map) return;
		const dark = this.mapStyle() === 'dark';
		for (const layer of map.getStyle().layers.filter((layer) => layer.type === 'symbol')) {
			if (!this.labelPaint.has(layer.id))
				this.labelPaint.set(layer.id, {
					'text-color': map.getPaintProperty(layer.id, 'text-color'),
					'text-halo-color': map.getPaintProperty(layer.id, 'text-halo-color'),
					'text-halo-width': map.getPaintProperty(layer.id, 'text-halo-width'),
				});
			const original = this.labelPaint.get(layer.id)!;
			map.setPaintProperty(
				layer.id,
				'text-color',
				onColour ? (dark ? '#ffffff' : '#111111') : original['text-color'],
			);
			map.setPaintProperty(
				layer.id,
				'text-halo-color',
				onColour
					? dark
						? 'rgba(0,0,0,0.85)'
						: 'rgba(255,255,255,0.9)'
					: original['text-halo-color'],
			);
			map.setPaintProperty(
				layer.id,
				'text-halo-width',
				onColour ? 1.6 : original['text-halo-width'],
			);
		}
	}
	private async openArea(
		area: Feature<Geometry>,
		lngLat: import('maplibre-gl').LngLat,
	): Promise<void> {
		if (!this.map || !this.popupClass || area.properties?.['averagePrice'] == null) return;
		const props = area.properties!,
			bounds = areaBounds(area),
			view = this.view();
		const content = document.createElement('div');
		for (const text of [
			String(props['name']),
			price(Number(props['averagePrice']), this.snapshot()?.fuel.unit) + ' de media',
			props['stations'] + ' gasolineras',
		]) {
			const line = document.createElement('p');
			line.textContent = text;
			content.append(line);
		}
		const button = document.createElement('button');
		button.textContent = view === 'municipalities' ? 'Ver gasolineras aquí' : 'Ver en el mapa';
		button.addEventListener('click', async () => {
			this.popup?.remove();
			this.setView('stations');
			if (view === 'provinces') {
				this.provinceFocus.emit(String(props['provinceId']));
				this.map?.fitBounds(bounds, { padding: 40 });
				return;
			}
			let origin: SearchOrigin = {
				name: String(props['name']),
				longitude: (bounds[0][0] + bounds[1][0]) / 2,
				latitude: (bounds[0][1] + bounds[1][1]) / 2,
			};
			try {
				const keys = municipalityKeys(String(props['name']));
				const places = await firstValueFrom(this.api.getPlaces());
				if (this.destroyed) return;
				const place = places.find(
					(row) =>
						row[1] === props['provinceId'] &&
						municipalityKeys(row[0]).some((key) => keys.includes(key)),
				);
				if (place) origin = { name: place[0], latitude: place[2], longitude: place[3] };
			} catch {}
			if (!this.destroyed) this.areaSearch.emit(origin);
		});
		content.append(button);
		this.popup?.remove();
		this.popup = new this.popupClass({
			className: this.mapStyle() === 'dark' ? 'area-popup area-popup-dark' : 'area-popup',
		})
			.setLngLat(lngLat)
			.setDOMContent(content)
			.addTo(this.map);
	}

	readonly freshness = freshness;
	readonly decimal = decimal;
	readonly canvas = viewChild.required<ElementRef<HTMLDivElement>>('canvas');
	private map?: LibreMap;
	private destroyed = false;
	private loaded = false;
	private hasLoaded = false;
	private resizeObserver?: ResizeObserver;

	constructor() {
		inject(DestroyRef).onDestroy(() => {
			this.destroyed = true;
			this.resizeObserver?.disconnect();
			this.popup?.remove();
			this.map?.remove();
		});
		afterNextRender(() => void this.initialize());
		effect(() => {
			this.view();
			this.snapshot();
			this.currentFuel();
			void this.refreshAreas();
		});
		effect(() => {
			const data = this.snapshot();
			this.origin();
			this.radius();
			if (this.loaded && this.map?.getSource('stations')) {
				if (data) this.updateDots(data);
				else
					(this.map.getSource('stations') as GeoJSONSource).setData({
						type: 'FeatureCollection',
						features: [],
					});
			}
		});
		effect(() => {
			const point = this.target();
			this.cardSize();
			if (!point) return;
			// A station chosen from the list must be visible, so the town and province fills give way to the dots.
			if (untracked(this.view) !== 'stations') this.view.set('stations');
			this.frameStation(point);
		});
		effect(() => {
			const id = this.selectedId();
			if (this.loaded) this.updateSelection(id);
		});
		effect(() => {
			this.focusArea();
			if (this.loaded) void this.updateFocus();
		});
		effect(() => {
			this.charging();
			this.minBand();
			if (this.loaded) this.updateCharging();
		});
		effect(() => {
			const id = this.selectedCharging();
			if (this.loaded) this.map?.setFilter('selected-charging', ['==', ['get', 'id'], id ?? '']);
		});
		// The electric mode has one layer and no town or province views.
		effect(() => {
			if (this.electric()) {
				this.popup?.remove();
				untracked(() => this.view.set('stations'));
			}
			if (this.loaded) untracked(() => this.updateAreas());
		});
		effect(() => {
			this.origin();
			this.radius();
			if (this.loaded) this.updateCircle();
		});
	}

	private async initialize(): Promise<void> {
		try {
			const libre = await import('maplibre-gl');
			this.popupClass = libre.Popup;
			if (this.destroyed) return;
			libre.setWorkerUrl(new URL('maplibre-gl-worker.mjs', document.baseURI).href);
			const map = (this.map = new libre.Map({
				container: this.canvas().nativeElement,
				style:
					'https://tiles.openfreemap.org/styles/' +
					(this.mapStyle() === 'dark' ? 'dark' : 'positron'),
				attributionControl: { compact: true },
				locale: {
					'Map.Title': 'Mapa de gasolineras',
					'NavigationControl.ZoomIn': 'Acercar',
					'NavigationControl.ZoomOut': 'Alejar',
					'AttributionControl.ToggleAttribution': 'Mostrar atribución',
					'AttributionControl.MapFeedback': 'Comentarios sobre el mapa',
				},
				bounds: [
					[PENINSULA_BOUNDS.west, PENINSULA_BOUNDS.south],
					[PENINSULA_BOUNDS.east, PENINSULA_BOUNDS.north],
				],
				fitBoundsOptions: { padding: 24 },
			}));
			this.ignAttribution = new libre.AttributionControl({
				compact: true,
				customAttribution: '© Instituto Geográfico Nacional',
			});
			map.addControl(new libre.NavigationControl({ showCompass: false }), 'top-right');
			if (typeof ResizeObserver !== 'undefined') {
				this.resizeObserver = new ResizeObserver(() => {
					map.resize();
					if (this.target()) this.frameStation(this.target()!, true);
				});
				this.resizeObserver.observe(this.canvas().nativeElement);
			}
			map.on('error', () => {
				if (!this.loaded) this.failed.set(true);
			});
			map.on('moveend', () => {
				const bounds = map.getBounds();
				this.boundsChange.emit({
					west: bounds.getWest(),
					south: bounds.getSouth(),
					east: bounds.getEast(),
					north: bounds.getNorth(),
				});
			});
			// The dots go in as soon as the style is ready: "load" also waits for every first tile, which on a slow
			// connection left the map without prices for several seconds.
			// MapLibre opens the compact attribution on the first full load; fold it so it does not cover the legend.
			// The "i" button still opens it.
			map.once('load', () => {
				map
					.getContainer()
					.querySelector('.maplibregl-ctrl-attrib')
					?.classList.remove('maplibregl-compact-show');
			});
			map.on('style.load', () => {
				const restoring = this.hasLoaded;
				this.hasLoaded = true;
				this.loaded = true;
				this.failed.set(false);
				const bounds = map.getBounds();
				this.boundsChange.emit({
					west: bounds.getWest(),
					south: bounds.getSouth(),
					east: bounds.getEast(),
					north: bounds.getNorth(),
				});
				for (const { id, source } of MAP_SOURCES) map.addSource(id, source);
				const theme = {
					dark: this.mapStyle() === 'dark',
					prices: this.colours(),
					power: this.powerColours(),
				};
				// Under the base map's labels, so town and road names stay readable over the colours.
				const firstLabel = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
				for (const layer of underLabelLayers(theme)) map.addLayer(layer, firstLabel);
				for (const layer of topLayers(theme)) map.addLayer(layer);
				this.updateCharging();
				void this.updateFocus();
				this.updateSelection(this.selectedId());
				const snapshot = this.snapshot();
				this.updateCircle(!restoring);
				this.updateAreas();
				if (snapshot) this.updateDots(snapshot);
				if (!restoring && this.target()) this.frameStation(this.target()!);
			});
			map.on('click', (event) => {
				if (this.electric()) {
					const sites = map.queryRenderedFeatures(event.point, { layers: ['charging-points'] });
					const id = sites[0]?.properties['id'];
					const point = this.charging()?.sites.find((site) => site[0] === id);
					if (point) this.chooseCharging.emit(point);
					else this.dismiss.emit();
					return;
				}
				if (this.view() !== 'stations') {
					const areas = map.queryRenderedFeatures(event.point, { layers: ['area-fill'] });
					if (areas[0])
						void this.openArea(
							this.areaData?.features.find((area) => String(area.id) === String(areas[0].id)) ??
								areas[0],
							event.lngLat,
						);
					return;
				}
				const features = map.queryRenderedFeatures(event.point, { layers: ['stations'] });
				const id = Number(features[0]?.properties['id']);
				if (features.length && Number.isFinite(id)) this.choose.emit(id);
				else this.dismiss.emit();
			});
			map.on('mouseenter', 'stations', () => {
				map.getCanvas().style.cursor = 'pointer';
			});
			map.on('mouseleave', 'stations', () => {
				map.getCanvas().style.cursor = '';
			});
			map.on('mouseenter', 'charging-points', () => {
				map.getCanvas().style.cursor = 'pointer';
			});
			map.on('mouseleave', 'charging-points', () => {
				map.getCanvas().style.cursor = '';
			});
		} catch {
			if (!this.destroyed) this.failed.set(true);
		}
	}

	private frameStation(point: StationPoint | ChargingPoint, immediate = false): void {
		if (!this.map || !this.loaded) return;
		const desktop = window.matchMedia?.('(min-width: 1024px)').matches ?? false;
		const size = this.cardSize();
		const options = {
			center: [point[2], point[1]] as [number, number],
			zoom: Math.max(14, this.map.getZoom()),
			padding: desktop
				? { left: size.width + 32, top: this.circlePadding().top, right: 16, bottom: 16 }
				: { left: 16, right: 16, top: this.circlePadding().top, bottom: size.height + 16 },
			retainPadding: false,
		};
		if (immediate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
			this.map.jumpTo(options);
		else this.map.flyTo(options);
	}

	private updateCharging(): void {
		const source = this.map?.getSource('charging') as GeoJSONSource | undefined;
		if (!source) return;
		source.setData(chargingFeatures(this.charging()?.sites ?? []));
		this.map!.setFilter('charging-points', ['>=', ['get', 'band'], this.minBand()]);
	}

	// The outline comes from the same province boundaries as the Provincias view, loaded once.
	private async updateFocus(): Promise<void> {
		const id = this.focusArea();
		const sequence = ++this.focusSequence;
		let data: FeatureCollection = { type: 'FeatureCollection', features: [] };
		if (id) {
			try {
				const provinces = await this.boundaries.load('provinces');
				const area = provinces.features.find(
					(feature) => String(feature.id).padStart(2, '0') === id,
				);
				if (area) data = { type: 'FeatureCollection', features: [area] };
			} catch {}
		}
		if (this.destroyed || sequence !== this.focusSequence || !this.loaded) return;
		(this.map?.getSource('focus-area') as GeoJSONSource | undefined)?.setData(data);
	}

	private updateSelection(id: number | null): void {
		this.map?.setFilter('selected-station', ['==', ['get', 'id'], id ?? -1]);
	}

	private updateCircle(frame = true): void {
		const source = this.map!.getSource('circle-area') as GeoJSONSource;
		const origin = this.origin();
		if (!origin) {
			source.setData({ type: 'FeatureCollection', features: [] });
			if (frame) this.reset();
			return;
		}
		const polygon = circlePolygon(origin, this.radius());
		source.setData({
			type: 'FeatureCollection',
			features: [
				{ type: 'Feature', geometry: polygon, properties: {} },
				{
					type: 'Feature',
					geometry: { type: 'Point', coordinates: [origin.longitude, origin.latitude] },
					properties: {},
				},
			],
		});
		if (!frame) return;
		const ring = polygon.coordinates[0];
		this.map!.fitBounds(
			[
				[Math.min(...ring.map((point) => point[0])), Math.min(...ring.map((point) => point[1]))],
				[Math.max(...ring.map((point) => point[0])), Math.max(...ring.map((point) => point[1]))],
			],
			{ padding: this.circlePadding() },
		);
	}

	// Keep the whole circle clear of the controls on top and the legend at the bottom.
	private circlePadding(): { top: number; bottom: number; left: number; right: number } {
		const section = this.canvas().nativeElement.parentElement;
		const legend = section?.querySelector<HTMLElement>('.legend')?.offsetHeight ?? 0;
		const controls = section?.querySelector<HTMLElement>('.controls')?.offsetHeight ?? 0;
		return { top: controls + 24, bottom: legend + 48, left: 24, right: 56 };
	}

	private updateDots(snapshot: StationSnapshot): void {
		(this.map!.getSource('stations') as GeoJSONSource).setData(
			stationFeatures(snapshot, this.origin(), this.radius()),
		);
	}

	readonly ranges = computed(() => {
		const prices =
			this.view() === 'stations'
				? (this.snapshot()?.stations.map((point) => point[3]) ?? [])
				: this.areaRows().map((row) => row[2]);
		if (!prices.length) return [];
		const cuts = [Math.min(...prices), ...quintileBreaks(prices), Math.max(...prices)];
		return cuts
			.slice(0, 5)
			.map(
				(cut, index) =>
					`${decimal(cut)}–${decimal(cuts[index + 1])} €/${this.snapshot()?.fuel.unit ?? 'l'}`,
			);
	});
	readonly extents = computed(() => {
		const prices =
			this.view() === 'stations'
				? (this.snapshot()?.stations.map((point) => point[3]) ?? [])
				: this.areaRows().map((row) => row[2]);
		return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
	});

	reset(): void {
		this.map?.fitBounds(
			[
				[PENINSULA_BOUNDS.west, PENINSULA_BOUNDS.south],
				[PENINSULA_BOUNDS.east, PENINSULA_BOUNDS.north],
			],
			{ padding: 24 },
		);
		this.boundsChange.emit(PENINSULA_BOUNDS);
	}
	canaries(): void {
		this.map?.fitBounds(
			[
				[-18.3, 27.5],
				[-13.2, 29.6],
			],
			{ padding: 24 },
		);
		this.boundsChange.emit({ west: -18.3, south: 27.5, east: -13.2, north: 29.6 });
	}
}
