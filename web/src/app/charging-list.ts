import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	linkedSignal,
	output,
	signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { count, decimal } from './price-format';
import { ChargingPoint, ChargingSummary, SearchOrigin } from './price-models';
import { PricesApi } from './prices-api';
import { POWER_BANDS, powerText, sortCharging } from './charging-functions';

/**
 * The keyboard and screen reader way into the electric map, shown inside the charging board like the fuel top 5:
 * the most powerful sites on the map, or the nearest ones around a search.
 */
@Component({
	selector: 'app-charging-list',
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<section aria-labelledby="charging-list-title">
			<h2 id="charging-list-title">{{ title() }}</h2>
			@if (minBand() > 0) {
				<p class="note">{{ bandNote() }}.</p>
			}
			<ol>
				@for (row of rows(); track row.point[0]; let index = $index) {
					<li>
						<button (click)="choose.emit(row.point)">
							<span class="position" aria-hidden="true">{{ index + 1 }}</span>
							<span
								><strong>{{ summary(row.point[0])?.operator ?? 'Punto de recarga' }}</strong>
								<span class="town">{{ summary(row.point[0])?.town ?? '' }}</span></span
							>
							@if (row.distanceKm !== null) {
								<span class="distance">{{ decimal(row.distanceKm, 1) }} km</span>
							}
							@if (led()) {
								<span class="led" aria-hidden="true"
									>{{ ledPower(row.point[3]) }}<small>kW</small></span
								>
								<span class="visually-hidden">{{ powerText(row.point[3]) }}</span>
							} @else {
								<span class="power">{{ powerText(row.point[3]) }}</span>
							}
						</button>
					</li>
				} @empty {
					<li>
						No hay puntos de recarga{{ minBand() > 0 ? ' de esta potencia' : '' }}
						{{ origin() ? 'a menos de ' + radius() + ' km' : 'en esta zona' }}.
					</li>
				}
			</ol>
			@if (origin() && sorted().length > visibleCount()) {
				<button class="more" (click)="visibleCount.update(addPage)">Ver más</button>
			}
		</section>
	`,
	styles: `
		h2 {
			font-size: 20px;
			margin: 0;
		}
		.note,
		.town {
			color: var(--ink-2);
			font-size: 14px;
		}
		.note {
			margin: 4px 0 0;
		}
		.town {
			display: block;
		}
		ol {
			list-style: none;
			padding: 0;
			margin: 12px 0;
		}
		li + li {
			border-top: 1px solid var(--hairline);
		}
		li > button {
			display: flex;
			align-items: center;
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
		.position {
			flex: 0 0 1.2em;
			color: var(--ink-2);
			font-variant-numeric: tabular-nums;
		}
		.distance {
			white-space: nowrap;
			color: var(--ink-2);
			font-size: 14px;
			margin-left: auto;
		}
		.power,
		.led {
			margin-left: auto;
			white-space: nowrap;
		}
		.power {
			font-variant-numeric: tabular-nums;
		}
		/* Inside the charging board the power uses its LED digits, as the price board does. */
		.led {
			font:
				24px/1.2 DSEG7,
				monospace;
			color: var(--led);
		}
		.led small {
			margin-left: 4px;
			font:
				12px 'Fira Sans',
				sans-serif;
			color: var(--ink-2);
		}
		.distance + .power,
		.distance + .led {
			margin-left: 0;
		}
	`,
})
export class ChargingList {
	private readonly api = inject(PricesApi);
	readonly sites = input<{ point: ChargingPoint; distanceKm: number | null }[]>([]);
	readonly origin = input<SearchOrigin | null>(null);
	readonly radius = input(10);
	readonly minBand = input(0);
	// How many rows at a time: 5 inside the charging board.
	readonly pageSize = input(10);
	readonly led = input(false);
	readonly choose = output<ChargingPoint>();
	readonly decimal = decimal;
	readonly powerText = powerText;
	readonly sorted = computed(() => sortCharging(this.sites()));
	readonly visibleCount = linkedSignal(() => {
		this.origin();
		this.radius();
		this.minBand();
		return this.pageSize();
	});
	readonly addPage = (value: number) => value + this.pageSize();
	readonly rows = computed(() =>
		this.sorted().slice(0, this.origin() ? this.visibleCount() : this.pageSize()),
	);
	readonly title = computed(() => {
		const origin = this.origin();
		if (origin) {
			const found = this.sorted().length;
			return `${count(found)} ${found === 1 ? 'punto de recarga' : 'puntos de recarga'} a menos de ${this.radius()} km de ${origin.name === 'Tu ubicación' ? 'ti' : origin.name}`;
		}
		const shown = this.rows().length;
		if (shown === 1) return 'El más potente de la zona del mapa';
		return shown
			? `Los ${shown} más potentes de la zona del mapa`
			: 'Más potentes de la zona del mapa';
	});
	readonly bandNote = computed(() => `${POWER_BANDS[this.minBand()].name} o más`);
	private readonly summaries = signal(new Map<string, ChargingSummary>());

	constructor() {
		// The names of the rows on screen, in one request; the API keeps the ones it has already seen.
		toObservable(computed(() => this.rows().map((row) => row.point[0])))
			.pipe(
				switchMap((ids) =>
					ids.length ? this.api.getChargingSummaries(ids).pipe(catchError(() => of([]))) : of([]),
				),
				takeUntilDestroyed(),
			)
			.subscribe((rows) => this.summaries.set(new Map(rows.map((row) => [row.id, row]))));
	}

	summary(id: string): ChargingSummary | undefined {
		return this.summaries().get(id);
	}

	// As on the price board, the LED's decimal separator is its dot segment: 7,4 kW shows as 7.4.
	ledPower(powerKw: number): string {
		return Number.isInteger(powerKw) ? String(powerKw) : powerKw.toFixed(1);
	}
}
