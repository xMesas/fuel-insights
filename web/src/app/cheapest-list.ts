import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	output,
	signal,
	linkedSignal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { cheapestInView, count, decimal, ledParts, price } from './price-format';
import { nearbyStations } from './place-functions';
import { SEARCH_RADII } from './place-search';
import {
	NearbyOrder,
	SearchOrigin,
	StationSummary,
	StationPoint,
	ViewBounds,
} from './price-models';
import { PricesApi } from './prices-api';
import { openState } from './station-functions';
import { PRICE_CLOCK } from './price-clock';
import { interval } from 'rxjs';

@Component({
	selector: 'app-cheapest-list',
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<section aria-labelledby="cheapest-title">
			<h2 id="cheapest-title">{{ title() }}</h2>
			@if (origin()) {
				<fieldset class="order">
					<legend class="visually-hidden">Ordenar gasolineras</legend>
					<label [class.selected]="order() === 'price'"
						><input
							type="radio"
							name="nearby-order"
							[checked]="order() === 'price'"
							(change)="order.set('price')"
						/>Más baratas</label
					>
					<label [class.selected]="order() === 'distance'"
						><input
							type="radio"
							name="nearby-order"
							[checked]="order() === 'distance'"
							(change)="order.set('distance')"
						/>Más cercanas</label
					>
				</fieldset>
			}
			<ol>
				@for (row of rows(); track row.point[0]; let index = $index) {
					@let point = row.point;
					<li>
						<button (click)="choose.emit(point)">
							<span class="position" aria-hidden="true">{{ index + 1 }}</span>
							<span
								><strong>{{ detail(point[0])?.name || 'Gasolinera ' + point[0] }}</strong>
								<span class="municipality"
									>{{ detail(point[0])?.municipality || 'Consultar gasolinera' }}
									@if (isClosed(point[0])) {
										<span>Cerrada</span>
									}
								</span></span
							>
							@if (row.distanceKm !== null) {
								<span class="distance">{{ decimal(row.distanceKm, 1) }} km</span>
							}
							@if (led() && ledParts(point[3]); as digits) {
								<span class="led" aria-hidden="true"
									>{{ digits.main }}<sup>{{ digits.last }}</sup></span
								>
								<span class="visually-hidden">{{ price(point[3], unit()) }}</span>
							} @else {
								<span class="price">{{ price(point[3], unit()) }}</span>
							}
						</button>
					</li>
				} @empty {
					@if (origin()) {
						<li>No hay gasolineras con {{ fuelName() }} a menos de {{ radius() }} km.</li>
					} @else {
						<li>
							No hay gasolineras con precio en esta zona. Mueve el mapa o elige otro carburante.
						</li>
					}
				}
			</ol>
			@if (origin() && !nearby().length && nextRadius(); as next) {
				<button (click)="radiusChange.emit(next)">Ampliar a {{ next }} km</button>
			}
			@if (origin() && nearby().length > visibleCount()) {
				<button (click)="visibleCount.update(addPage)">Ver más</button>
			}
		</section>
	`,
	styles: `
		h2 {
			font-size: 20px;
			margin: 0;
		}
		.note,
		.municipality {
			color: var(--ink-2);
			font-size: 14px;
		}
		ol {
			list-style: none;
			padding: 0;
			margin: 12px 0;
		}
		li + li {
			border-top: 1px solid var(--hairline);
		}
		button {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			text-align: left;
			width: 100%;
			border: 0;
			border-radius: 0;
			background: transparent;
			padding: 12px 0;
		}
		strong {
			overflow-wrap: anywhere;
			font-weight: 600;
		}
		.municipality {
			display: block;
		}
		.price {
			white-space: nowrap;
			font-variant-numeric: tabular-nums;
		}
		.position {
			flex: 0 0 1.2em;
			color: var(--ink-2);
			font-variant-numeric: tabular-nums;
		}
		/* Inside the price board the prices are its LED digits, as on a station's sign. */
		.led {
			margin-left: auto;
			white-space: nowrap;
			font:
				24px/1.2 DSEG7,
				monospace;
			color: var(--led);
		}
		.distance + .led {
			margin-left: 0;
		}
		sup {
			font-size: 0.6em;
			vertical-align: super;
		}
		.distance {
			white-space: nowrap;
			color: var(--ink-2);
			font-size: 14px;
			margin-left: auto;
		}
		.order {
			display: flex;
			border: 0;
			padding: 0;
			gap: 8px;
			margin: 16px 0;
		}
		.order label {
			position: relative;
			display: grid;
			place-items: center;
			padding: 8px 12px;
			min-height: 44px;
			border-radius: 8px;
			cursor: pointer;
		}
		.order .selected {
			background: var(--surface);
			box-shadow: inset 0 0 0 1px var(--axis);
		}
		.order label:focus-within {
			outline: 2px solid var(--focus);
			outline-offset: 2px;
		}
		.order input {
			position: absolute;
			opacity: 0;
			width: 1px;
			height: 1px;
		}
	`,
})
export class CheapestList {
	private readonly api = inject(PricesApi);
	private readonly clock = inject(PRICE_CLOCK);
	readonly now = signal(this.clock.now());
	readonly stations = input<StationPoint[]>([]);
	readonly bounds = input.required<ViewBounds>();
	readonly fuelName = input('');
	readonly unit = input('l');
	readonly origin = input<SearchOrigin | null>(null);
	readonly radius = input(10);
	// How many rows at a time: 5 inside the price board.
	readonly pageSize = input(10);
	readonly led = input(false);
	readonly ledParts = ledParts;
	readonly radiusChange = output<number>();
	readonly order = linkedSignal<NearbyOrder>(() => {
		this.origin();
		return 'price';
	});
	readonly visibleCount = linkedSignal(() => {
		this.origin();
		this.radius();
		this.order();
		this.fuelName();
		return this.pageSize();
	});
	readonly addPage = (value: number) => value + this.pageSize();
	readonly nearby = computed(() =>
		this.origin()
			? nearbyStations(this.stations(), this.origin()!, this.radius(), this.order())
			: [],
	);
	readonly choose = output<StationPoint>();
	readonly points = computed(() => cheapestInView(this.stations(), this.bounds(), this.pageSize()));
	readonly rows = computed(() =>
		this.origin()
			? this.nearby().slice(0, this.visibleCount())
			: this.points().map((point) => ({ point, distanceKm: null })),
	);
	readonly title = computed(() => {
		const origin = this.origin();
		if (!origin) {
			const found = this.points().length;
			if (found === 1) return 'La más barata de la zona del mapa';
			return found
				? `Las ${found} más baratas de la zona del mapa`
				: 'Más baratas de la zona del mapa';
		}
		return `${count(this.nearby().length)} ${this.nearby().length === 1 ? 'gasolinera' : 'gasolineras'} a menos de ${this.radius()} km de ${origin.name === 'Tu ubicación' ? 'tu ubicación' : origin.name}`;
	});
	readonly nextRadius = computed(() => SEARCH_RADII.find((radius) => radius > this.radius()));
	readonly details = signal<StationSummary[]>([]);
	readonly price = price;
	readonly decimal = decimal;
	constructor() {
		if (isPlatformBrowser(inject(PLATFORM_ID)))
			interval(60_000)
				.pipe(takeUntilDestroyed())
				.subscribe(() => this.now.set(this.clock.now()));
		toObservable(this.rows)
			.pipe(
				switchMap((rows) => {
					const batches = [];
					for (let index = 0; index < rows.length; index += 50)
						batches.push(
							this.api
								.getStationSummaries(rows.slice(index, index + 50).map((row) => row.point[0]))
								.pipe(catchError(() => of([]))),
						);
					return batches.length ? forkJoin(batches) : of([]);
				}),
				takeUntilDestroyed(),
			)
			.subscribe((batches) => this.details.set(batches.flat()));
	}
	detail(id: number): StationSummary | undefined {
		return this.details().find((station) => station.id === id);
	}
	isClosed(id: number): boolean {
		return openState(this.detail(id)?.openingHours, new Date(this.now())).kind === 'closed';
	}
}
