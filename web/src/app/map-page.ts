import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { effectiveDate, price, time } from './price-format';
import { FuelPreference } from './fuel-preference';
import { MAP_DESCRIPTION, MAP_TITLE, Seo } from './seo';
import {
	afterNextRender,
	PLATFORM_ID,
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	inject,
	signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, fromEvent, interval, map, of, switchMap, tap } from 'rxjs';
import { PricesApi } from './prices-api';
import {
	Area,
	ChargingPoint,
	ChargingSite,
	ChargingSnapshot,
	CurrentStats,
	Fuel,
	StationDetail,
	StationPoint,
	StationSnapshot,
	SearchOrigin,
	ViewBounds,
	ZoneQuery,
	ZoneStats,
} from './price-models';
import { PriceBoard } from './price-board';
import { distanceKm, nearbyStations } from './place-functions';
import { CheapestList } from './cheapest-list';
import { StationCard } from './station-card';
import { PENINSULA_BOUNDS, StationMap } from './station-map';
import { PRICE_CACHE_LIFETIME, PRICE_CLOCK } from './price-clock';
import { PlaceSearch } from './place-search';
import { LedNotice } from './led-notice';
import { CHARGING_PARAM, STATION_PARAM } from './station-functions';
import { ChargingBoard } from './charging-board';
import { ChargingCard } from './charging-card';
import { ChargingList } from './charging-list';
import { bandOf, chargingInScope } from './charging-functions';

const LOCATION_NOTICE = 'No pudimos ver tu ubicación. Revisa el permiso del navegador.';

type Status = 'loading' | 'ready' | 'empty' | 'error';

@Component({
	imports: [
		RouterLink,
		PriceBoard,
		CheapestList,
		StationCard,
		StationMap,
		PlaceSearch,
		LedNotice,
		ChargingBoard,
		ChargingCard,
		ChargingList,
	],
	selector: 'app-map-page',
	styleUrl: './map-page.css',
	templateUrl: './map-page.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapPage {
	readonly summaryDate = effectiveDate;
	readonly summaryTime = time;
	readonly summaryPrice = price;
	readonly summaryFuels = computed(
		() =>
			this.current()?.fuels.filter(
				(row) =>
					['GASOLEO_A', 'GASOLINA_95_E5'].includes(row.fuel.code) && row.averagePrice !== null,
			) ?? [],
	);
	private readonly api = inject(PricesApi);
	private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
	private readonly router = inject(Router);
	private readonly route = inject(ActivatedRoute);
	private readonly preference = inject(FuelPreference);
	private readonly destroyRef = inject(DestroyRef);
	private locationSequence = 0;
	readonly notice = signal<string | null>(null);
	private readonly clock = inject(PRICE_CLOCK);
	private readonly refreshVersion = signal(0);
	private lastRefresh = this.clock.now();
	private readonly currentAttempt = signal(0);
	private readonly stationAttempt = signal(0);
	private readonly cardAttempt = signal(0);
	private previousFocus?: HTMLElement;
	// A driver uses one fuel: the choice is remembered in this browser.
	readonly selectedFuel = this.preference.fuel;
	// A province chosen on the map outlines it and labels the board.
	readonly provinceFocus = signal<string | null>(null);
	readonly selectedArea = computed(() => this.provinceFocus() ?? 'ES');
	readonly areas = signal<Area[]>([]);
	readonly fuels = signal<Fuel[]>([]);
	readonly areaName = computed(
		() => this.areas().find((area) => area.id === this.selectedArea())?.name ?? 'España',
	);
	readonly current = signal<CurrentStats | null>(null);
	readonly currentStatus = signal<Status>('loading');
	readonly currentFuel = computed(() =>
		this.current()?.fuels.find((row) => row.fuel.code === this.selectedFuel()),
	);
	readonly snapshot = signal<StationSnapshot | null>(null);
	readonly stationStatus = signal<Status>('loading');
	readonly bounds = signal<ViewBounds>(PENINSULA_BOUNDS);
	readonly target = signal<StationPoint | ChargingPoint | null>(null);
	readonly origin = signal<SearchOrigin | null>(null);
	readonly radius = signal(10);
	readonly stationId = signal<number | null>(null);
	readonly station = signal<StationDetail | null>(null);
	readonly cardError = signal(false);
	readonly cardSize = signal({ width: 360, height: 300 });
	// Fuel prices or public charging: one page, two modes that share the search, the map and its controls.
	readonly mode = signal<'fuel' | 'electric'>('fuel');
	readonly chargingSnapshot = signal<ChargingSnapshot | null>(null);
	readonly chargingStatus = signal<Status>('loading');
	private readonly chargingAttempt = signal(0);
	// The slowest class shown: 0 shows every site.
	readonly minBand = signal(0);
	readonly chargingId = signal<string | null>(null);
	readonly chargingSite = signal<ChargingSite | null>(null);
	readonly chargingError = signal(false);
	private readonly chargingCardAttempt = signal(0);
	private readonly chargingScope = computed(() =>
		chargingInScope(
			this.chargingSnapshot()?.sites ?? [],
			this.bounds(),
			this.origin(),
			this.radius(),
		),
	);
	readonly chargingBoardSites = computed(() => this.chargingScope().map((row) => row.point));
	readonly chargingListSites = computed(() =>
		this.chargingScope().filter((row) => bandOf(row.point[3]) >= this.minBand()),
	);
	readonly chargingScopeLabel = computed(() => {
		const origin = this.origin();
		return origin
			? `a menos de ${this.radius()} km de ${origin.name === 'Tu ubicación' ? 'ti' : origin.name}`
			: 'en la zona del mapa';
	});
	readonly chargingDistance = computed(() =>
		this.origin() && this.chargingSite() ? distanceKm(this.origin()!, this.chargingSite()!) : null,
	);
	// The board describes what the driver looks at: a province, the search circle, or the map.
	// A province only outlines the map; the board and its list follow the view, so zooming in
	// always narrows them.
	readonly zoneQuery = computed<ZoneQuery>(() => {
		const origin = this.origin();
		if (origin) return { kind: 'circle', origin, radius: this.radius() };
		return { kind: 'box', bounds: this.bounds() };
	});
	// The zone figures with the query that produced them. The board shows them only for the zone on screen: while a
	// new zone loads, or if it fails, it shows none rather than another zone's average next to this zone's top 5.
	private readonly boardZone = signal<{
		query: ZoneQuery;
		stats: ZoneStats | null;
		label: string;
	} | null>(null);
	readonly currentZone = computed(() => {
		const zone = this.boardZone();
		return zone && JSON.stringify(zone.query) === JSON.stringify(this.zoneQuery()) ? zone : null;
	});
	readonly scopeLabel = computed(() => {
		const query = this.zoneQuery();
		if (query.kind === 'circle')
			return `a menos de ${query.radius} km de ${this.origin()!.name === 'Tu ubicación' ? 'ti' : this.origin()!.name}`;
		return 'en la zona del mapa';
	});
	// The stations a card is ranked against: the search circle, or 10 km around the station when there is no
	// search (or the station lies outside it). Fixed by distance, so zooming the map never changes a ranking.
	readonly zone = computed(() => {
		const data = this.snapshot();
		const station = this.station();
		if (!data || !station || data.fuel.code !== this.selectedFuel()) return null;
		const origin = this.origin();
		if (origin) {
			const rows = nearbyStations(data.stations, origin, this.radius(), 'price');
			if (rows.some((row) => row.point[0] === station.id))
				return { rows, label: `a menos de ${this.radius()} km` };
		}
		return {
			rows: nearbyStations(data.stations, station, 10, 'price'),
			label: 'a menos de 10 km de aquí',
		};
	});
	readonly stationDistance = computed(() =>
		this.origin() && this.station() ? distanceKm(this.origin()!, this.station()!) : null,
	);

	constructor() {
		inject(Seo).set(MAP_TITLE, MAP_DESCRIPTION, '/');
		this.openFromLink();
		// The charging sites load the first time the driver switches to them, and stay for the visit.
		toObservable(
			computed(() => ({ electric: this.mode() === 'electric', attempt: this.chargingAttempt() })),
		)
			.pipe(
				switchMap(({ electric }) =>
					!electric || this.chargingSnapshot()
						? of(undefined)
						: this.api.getChargingSites().pipe(
								tap(() => this.chargingStatus.set('loading')),
								map((data) => ({ data, failed: false })),
								catchError(() => of({ data: null, failed: true })),
							),
				),
				takeUntilDestroyed(),
			)
			.subscribe((result) => {
				if (!result) return;
				this.chargingSnapshot.set(result.data);
				this.chargingStatus.set(result.failed ? 'error' : result.data ? 'ready' : 'empty');
			});
		toObservable(computed(() => ({ id: this.chargingId(), attempt: this.chargingCardAttempt() })))
			.pipe(
				tap(() => {
					if (this.chargingSite()?.id !== this.chargingId()) this.chargingSite.set(null);
					this.chargingError.set(false);
				}),
				switchMap(({ id }) =>
					id === null
						? of(null)
						: this.api.getChargingSite(id).pipe(
								catchError(() => {
									this.chargingError.set(true);
									return of(null);
								}),
							),
				),
				takeUntilDestroyed(),
			)
			.subscribe((site) => {
				this.chargingSite.set(site);
				// Opened from a link, before the map knew the site: frame it now.
				if (site && !this.target())
					this.target.set([
						site.id,
						site.latitude,
						site.longitude,
						site.maxPowerKw ?? 0,
						site.points,
					]);
			});
		if (this.browser) {
			interval(15 * 60_000)
				.pipe(takeUntilDestroyed())
				.subscribe(() => this.refreshPrices());
			fromEvent(document, 'visibilitychange')
				.pipe(takeUntilDestroyed())
				.subscribe(() => {
					if (
						document.visibilityState === 'visible' &&
						this.clock.now() - this.lastRefresh > PRICE_CACHE_LIFETIME
					)
						this.refreshPrices();
				});
		}
		toObservable(
			computed(() => ({ attempt: this.currentAttempt(), refresh: this.refreshVersion() })),
		)
			.pipe(
				tap(() => {
					if (!this.current()) this.currentStatus.set('loading');
				}),
				switchMap(({ refresh }) =>
					forkJoin({
						current: this.api.getCurrent(),
						fuels: refresh && this.fuels().length ? of(this.fuels()) : this.api.getFuels(),
						areas: refresh && this.areas().length ? of(this.areas()) : this.api.getAreas(),
					}).pipe(catchError(() => of(null))),
				),
				takeUntilDestroyed(),
			)
			.subscribe((result) => {
				if (!result) {
					this.currentStatus.set(this.current() ? 'ready' : 'error');
					return;
				}
				if (result.current || !this.current()) this.current.set(result.current);
				this.fuels.set(result.fuels);
				this.areas.set(result.areas);
				this.currentStatus.set(this.current() ? 'ready' : 'empty');
			});
		toObservable(
			computed(() => ({
				fuel: this.selectedFuel(),
				attempt: this.stationAttempt(),
				refresh: this.refreshVersion(),
			})),
		)
			.pipe(
				tap(() => {
					if (this.snapshot()?.fuel.code !== this.selectedFuel()) {
						this.stationStatus.set('loading');
						this.snapshot.set(null);
					}
				}),
				switchMap(({ fuel }) =>
					this.api.getStations(fuel).pipe(
						map((data) => ({ data, failed: false })),
						catchError(() => of({ data: null, failed: true })),
					),
				),
				takeUntilDestroyed(),
			)
			.subscribe(({ data, failed }) => {
				if (!data && this.snapshot()) {
					this.stationStatus.set('ready');
					return;
				}
				this.snapshot.set(data);
				this.stationStatus.set(failed ? 'error' : data ? 'ready' : 'empty');
			});
		toObservable(
			computed(() => ({
				id: this.stationId(),
				attempt: this.cardAttempt(),
				refresh: this.refreshVersion(),
			})),
		)
			.pipe(
				tap(() => {
					if (this.station()?.id !== this.stationId()) this.station.set(null);
					this.cardError.set(false);
				}),
				switchMap(({ id }) =>
					id === null
						? of(null)
						: this.api.getStation(id).pipe(
								catchError(() => {
									const previous = this.station()?.id === id ? this.station() : null;
									this.cardError.set(!previous);
									return of(previous);
								}),
							),
				),
				takeUntilDestroyed(),
			)
			.subscribe((station) => {
				this.station.set(station);
				if (station && !this.target())
					this.target.set([station.id, station.latitude, station.longitude, 0]);
			});
		toObservable(computed(() => ({ query: this.zoneQuery(), refresh: this.refreshVersion() })))
			.pipe(
				switchMap(({ query }) => {
					const label = this.scopeLabel();
					return this.api.getZone(query).pipe(
						map((stats) => ({ query, stats, label })),
						catchError(() => of(null)),
					);
				}),
				takeUntilDestroyed(),
			)
			.subscribe((zone) => this.boardZone.set(zone));
	}

	chooseFuel(code: string): void {
		this.preference.choose(code);
	}

	// From the board's list: open the station and, on a phone where the map sits below, take the driver to it.
	goToStation(point: StationPoint): void {
		this.chooseStation(point);
		this.scrollToMap();
	}

	goToCharging(point: ChargingPoint): void {
		this.openCharging(point);
		this.scrollToMap();
	}

	private scrollToMap(): void {
		if (!this.browser || !window.matchMedia?.('(max-width: 1023px)').matches) return;
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		document.querySelector('.map-slot')?.scrollIntoView({
			behavior: reduce ? 'auto' : 'smooth',
			block: 'start',
		});
	}

	// A shared link (?gasolinera=4375 or ?recarga=ID) opens that card, and on a phone shows the map.
	private openFromLink(): void {
		this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
			const station = Number(params.get(STATION_PARAM));
			const charging = params.get(CHARGING_PARAM);
			const id = Number.isInteger(station) && station > 0 ? station : null;
			if (id !== this.stationId() || charging !== this.chargingId()) this.target.set(null);
			this.stationId.set(id);
			this.chargingId.set(id === null ? charging : null);
			this.mode.set(
				id === null && (charging || params.get('modo') === 'recarga') ? 'electric' : 'fuel',
			);
		});
		afterNextRender(() => {
			if (this.stationId() !== null || this.chargingId() !== null) this.scrollToMap();
		});
	}

	private updateLink(): void {
		if (!this.browser) return;
		void this.router.navigate([], {
			relativeTo: this.route,
			queryParams: {
				[STATION_PARAM]: this.stationId(),
				[CHARGING_PARAM]: this.chargingId(),
				modo: this.mode() === 'electric' ? 'recarga' : null,
			},
			queryParamsHandling: 'merge',
			replaceUrl: true,
		});
	}

	setMode(mode: 'fuel' | 'electric'): void {
		if (mode === this.mode()) return;
		this.closeStation();
		// Charging follows the map or the search rather than a fuel province.
		if (mode === 'electric') this.provinceFocus.set(null);
		this.mode.set(mode);
		this.updateLink();
	}

	navigateMode(event: KeyboardEvent): void {
		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
		event.preventDefault();
		const next = this.mode() === 'fuel' ? 'electric' : 'fuel';
		this.setMode(next);
		(event.currentTarget as HTMLElement)
			.querySelectorAll<HTMLButtonElement>('button')
			[next === 'fuel' ? 0 : 1].focus();
	}

	openCharging(point: ChargingPoint): void {
		if (this.browser && this.chargingId() === null)
			this.previousFocus = document.activeElement as HTMLElement;
		this.target.set([...point]);
		this.chargingId.set(point[0]);
		this.updateLink();
	}

	retryCharging(): void {
		this.chargingAttempt.update((value) => value + 1);
	}

	retryChargingCard(): void {
		this.chargingCardAttempt.update((value) => value + 1);
	}

	private refreshPrices(): void {
		this.lastRefresh = this.clock.now();
		this.refreshVersion.update((value) => value + 1);
	}

	openStation(id: number): void {
		if (this.browser && this.stationId() === null)
			this.previousFocus = document.activeElement as HTMLElement;
		const point = this.snapshot()?.stations.find((point) => point[0] === id);
		if (point) this.target.set([...point]);
		this.stationId.set(id);
		this.updateLink();
	}

	setOrigin(origin: SearchOrigin | null): void {
		this.locationSequence++;
		if (origin) this.provinceFocus.set(null);
		this.origin.set(origin);
		this.radius.set(10);
		this.target.set(null);
		this.stationId.set(null);
		this.updateLink();
		if (origin) this.scrollToMap();
	}

	focusProvince(id: string): void {
		this.locationSequence++;
		this.origin.set(null);
		this.provinceFocus.set(id);
	}

	requestLocation(): void {
		if (!this.browser) return;
		const sequence = ++this.locationSequence;
		if (!navigator.geolocation) {
			this.notice.set(LOCATION_NOTICE);
			return;
		}
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				if (this.destroyRef.destroyed || sequence !== this.locationSequence) return;
				this.setOrigin({
					name: 'Tu ubicación',
					latitude: coords.latitude,
					longitude: coords.longitude,
				});
			},
			() => {
				if (!this.destroyRef.destroyed && sequence === this.locationSequence)
					this.notice.set(LOCATION_NOTICE);
			},
			{ timeout: 10_000 },
		);
	}
	chooseStation(point: StationPoint): void {
		this.target.set([...point]);
		this.openStation(point[0]);
	}
	closeStation(): void {
		if (this.stationId() === null && this.chargingId() === null) return;
		this.stationId.set(null);
		this.chargingId.set(null);
		this.target.set(null);
		this.updateLink();
		if (!this.browser) return;
		const opener = this.previousFocus?.isConnected
			? this.previousFocus
			: document.querySelector<HTMLElement>('.maplibregl-canvas');
		opener?.focus({ preventScroll: true });
	}
	retryCurrent(): void {
		this.currentAttempt.update((value) => value + 1);
	}
	retryStations(): void {
		this.stationAttempt.update((value) => value + 1);
	}
	retryCard(): void {
		this.cardAttempt.update((value) => value + 1);
	}
}
