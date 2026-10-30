import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FavouriteStar } from './favourite-star';
import { PLATFORM_ID } from '@angular/core';
import {
	afterNextRender,
	afterRenderEffect,
	DestroyRef,
	inject,
	signal,
	ChangeDetectionStrategy,
	Component,
	computed,
	ElementRef,
	input,
	output,
	viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { interval, map, of, switchMap } from 'rxjs';
import { decimal, effectiveDate, freshness, price } from './price-format';
import { Fuel, StationDetail, StationPoint } from './price-models';
import {
	Amount,
	amountAnswer,
	appleDirections,
	googleDirections,
	siteLink,
	STATION_PARAM,
	openLabel,
	openState,
	shareText,
	wazeDirections,
	zoneComparison,
	zoneRanking,
	ZoneRow,
} from './station-functions';
import { PRICE_CLOCK } from './price-clock';
import { PricesApi } from './prices-api';
import { distanceKm } from './place-functions';

/** The stations a card is compared with, and how the card names them ("a menos de 10 km"). */
export interface CardZone {
	rows: ZoneRow[];
	label: string;
}

// Open or closed details stay as the driver left them while moving between stations.
const detailsOpen = signal(false);
const FULL_TANK_LITRES = 50;

@Component({
	selector: 'app-station-card',
	imports: [RouterLink, FavouriteStar],
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { '(document:keydown.escape)': 'escape($event)', '(document:click)': 'outside($event)' },
	template: `
		<section aria-labelledby="station-title" role="region" #card>
			<div class="top">
				@if (ranking(); as rank) {
					@if (rank.total > 1) {
						<p class="rank">
							<span class="pill">{{ ordinal(rank.rank) }} más barata</span>
							<span class="note">de {{ rank.total }} {{ zone()!.label }}</span>
						</p>
					}
				}
				<span class="tools">
					@if (station()) {
						<button
							class="icon"
							[attr.aria-expanded]="detailsOpen()"
							aria-controls="station-details"
							aria-label="Más información"
							title="Más información"
							(click)="detailsOpen.set(!detailsOpen())"
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<circle cx="12" cy="12" r="9" />
								<path d="M12 11v6M12 7.5v.5" />
							</svg>
						</button>
					}
					<button class="icon" (click)="close.emit()" aria-label="Cerrar gasolinera">×</button>
				</span>
			</div>
			@if (station(); as data) {
				<h2 id="station-title" tabindex="-1">{{ data.name }}</h2>
				<app-favourite-star [stationId]="data.id" />
				<p class="note">{{ data.municipality }}</p>
				@if (distance() !== null) {
					<p class="note">{{ decimal(distance()!, 1) }} km</p>
				}
				<p [class.note]="state().kind === 'closed'">
					@if (state().kind === 'closed') {
						<svg class="clock" viewBox="0 0 24 24" aria-hidden="true">
							<circle cx="12" cy="12" r="9" />
							<path d="M12 6v6l4 2" />
						</svg>
					}
					{{ label() }}
				</p>
				@if (value() !== null) {
					<p class="selected-price">
						{{ price(value(), unit()) }}
						<small class="eu-label">{{ euLabel(selectedFuel()) }}</small>
					</p>
					<p class="note">{{ selectedName() }}</p>
				} @else {
					<p>Esta gasolinera no vende {{ selectedName() }}.</p>
				}
				@if (otherFuels().length) {
					<dl>
						@for (row of otherFuels(); track row.fuel.code) {
							<div>
								<dt>{{ row.fuel.name }}</dt>
								<dd>
									{{ price(row.price, row.fuel.unit) }}
									<small class="eu-label">{{ euLabel(row.fuel.code) }}</small>
								</dd>
							</div>
						}
					</dl>
				}
				@if (detailsOpen()) {
					<div id="station-details" class="details">
						@if (value() !== null) {
							<fieldset class="amounts">
								<legend>¿Cuánto vas a echar?</legend>
								@for (option of amounts(); track option.label) {
									<label [class.selected]="option.label === amountLabel()">
										<input
											type="radio"
											name="amount"
											[checked]="option.label === amountLabel()"
											(change)="amountLabel.set(option.label)"
										/>
										{{ option.label }}
									</label>
								}
							</fieldset>
							<p aria-live="polite">{{ answer() }}</p>
						}
						@if (ranking()?.alternative; as alternative) {
							<p>
								{{ alternativeLabel(alternative.kind, alternative.point[3]) }}:
								<button class="link" (click)="openStation.emit(alternative.point)">
									{{ alternativeName() ?? 'otra gasolinera' }}</button
								>, a {{ decimal(alternativeDistance()!, 1) }} km,
								{{ price(alternative.point[3], unit())
								}}{{
									alternative.point[3] === value()
										? ''
										: ' (' + centsDifference(alternative.point[3]) + ')'
								}}.
							</p>
						}
						@if (ranking(); as rank) {
							<p>
								Media de la zona: {{ price(rank.average, unit()) }} ({{ rank.total }}
								{{ rank.total === 1 ? 'gasolinera' : 'gasolineras' }}).
								@if (comparison(); as comparison) {
									{{ comparison.label }}.
								}
							</p>
						}
						@if (history().length) {
							<p id="spark-title">Últimos 30 días. {{ selectedName() }}.</p>
							<svg
								class="spark"
								viewBox="0 0 300 70"
								role="img"
								aria-labelledby="spark-title spark-description"
							>
								<title id="spark-description">{{ historyDescription() }}</title>
								@for (segment of segments(); track $index) {
									<polyline [attr.points]="segment" />
								}
								@for (point of coordinates(); track point.date) {
									<circle [attr.cx]="point.x" [attr.cy]="point.y" r="2" />
								}
							</svg>
							<p>
								{{ price(history().at(-1)!.price, unit()) }} ({{
									effectiveDate(history().at(-1)!.date)
								}}).
							</p>
						} @else {
							<p class="note">Aún sin historial para este carburante.</p>
						}
						<p class="note">{{ data.address }}</p>
						<p class="note">{{ freshness(data.updatedAt) }}</p>
						<p class="note coordinates">
							{{ decimal(data.latitude, 5) }}, {{ decimal(data.longitude, 5) }}
						</p>
					</div>
				}
				<div class="actions">
					<div class="directions" #disclosure>
						<button
							class="primary"
							#directionsButton
							[attr.aria-expanded]="menuOpen()"
							aria-controls="directions-links"
							(click)="menuOpen.set(!menuOpen())"
						>
							Cómo llegar
						</button>
						@if (menuOpen()) {
							<ul id="directions-links" aria-label="Elige una aplicación">
								@for (link of links(); track link.name) {
									<li>
										<a [href]="link.url" target="_blank" rel="noopener"
											>{{ link.name
											}}<span class="visually-hidden"> (se abre en otra pestaña)</span></a
										>
									</li>
								}
							</ul>
						}
					</div>
					<button (click)="share()">Compartir</button>
					<a class="page-link" [routerLink]="['/gasolinera', data.id]">Ver ficha</a>
					<p role="status" aria-live="polite" class="note share-status">{{ shareStatus() }}</p>
				</div>
			} @else if (error()) {
				<h2 id="station-title" tabindex="-1">No se pudo cargar la gasolinera.</h2>
				<button (click)="retry.emit()">Reintentar</button>
			} @else {
				<h2 id="station-title" tabindex="-1" role="status">Cargando gasolinera…</h2>
			}
		</section>
	`,
	styleUrl: './station-card.css',
})
export class StationCard {
	private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
	readonly station = input<StationDetail | null>(null);
	readonly fuels = input<Fuel[]>([]);
	readonly selectedFuel = input('GASOLEO_A');
	readonly error = input(false);
	readonly zone = input<CardZone | null>(null);
	readonly distance = input<number | null>(null);
	readonly close = output<void>();
	readonly retry = output<void>();
	readonly openStation = output<StationPoint>();
	readonly resized = output<{ width: number; height: number }>();
	readonly card = viewChild.required<ElementRef<HTMLElement>>('card');
	readonly price = price;
	euLabel(code: string): string {
		const ethanol = code.match(/_E(\d+)/)?.[1];
		if (ethanol) return 'E' + ethanol;
		if (['GASOLEO_A', 'GASOLEO_PREMIUM'].includes(code)) return 'B7';
		return '';
	}
	readonly effectiveDate = effectiveDate;
	readonly freshness = freshness;
	readonly decimal = decimal;
	readonly detailsOpen = detailsOpen;
	private readonly api = inject(PricesApi);
	private readonly host = inject(ElementRef<HTMLElement>);
	private readonly clock = inject(PRICE_CLOCK);
	private readonly destroyRef = inject(DestroyRef);
	readonly now = signal(this.clock.now());
	readonly unit = computed(
		() =>
			this.station()?.prices.find((row) => row.fuel.code === this.selectedFuel())?.fuel.unit ??
			this.fuels().find((fuel) => fuel.code === this.selectedFuel())?.unit ??
			'l',
	);
	readonly selectedName = computed(
		() => this.fuels().find((fuel) => fuel.code === this.selectedFuel())?.name ?? '',
	);
	readonly value = computed(
		() =>
			this.station()?.prices.find((row) => row.fuel.code === this.selectedFuel())?.price ?? null,
	);
	// Only what the station sells: a fuel without a price is not listed at all.
	readonly otherFuels = computed(
		() => this.station()?.prices.filter((row) => row.fuel.code !== this.selectedFuel()) ?? [],
	);
	readonly ranking = computed(() => {
		const station = this.station();
		const zone = this.zone();
		return station && zone ? zoneRanking(zone.rows, station.id) : null;
	});
	readonly comparison = computed(() => {
		const ranking = this.ranking();
		return this.value() === null || !ranking
			? null
			: zoneComparison(this.value()!, ranking.average);
	});
	readonly amounts = computed(() => {
		const options: { label: string; amount: Amount }[] = [10, 20, 50].map((euros) => ({
			label: `${euros} €`,
			amount: { kind: 'euros', euros },
		}));
		if (this.unit() === 'l' && this.selectedFuel() !== 'ADBLUE')
			options.push({ label: 'Lleno', amount: { kind: 'full', litres: FULL_TANK_LITRES } });
		return options;
	});
	readonly amountLabel = signal('20 €');
	readonly answer = computed(() => {
		const value = this.value();
		const option =
			this.amounts().find((row) => row.label === this.amountLabel()) ?? this.amounts()[1];
		return value === null
			? ''
			: amountAnswer(value, this.ranking()?.average ?? null, option.amount, this.unit());
	});
	readonly alternativeDistance = computed(() => {
		const station = this.station();
		const point = this.ranking()?.alternative?.point;
		return station && point
			? distanceKm(station, { latitude: point[1], longitude: point[2] })
			: null;
	});
	readonly alternativeName = signal<string | null>(null);
	readonly state = computed(() => openState(this.station()?.openingHours, new Date(this.now())));
	readonly label = computed(() => openLabel(this.state(), this.station()?.schedule ?? ''));
	readonly history = computed(() =>
		(
			this.station()?.history.find((row) => row.fuel === this.selectedFuel())?.points ?? []
		).toSorted((a, b) => a.date.localeCompare(b.date)),
	);
	readonly coordinates = computed(() => {
		const history = this.history();
		if (!history.length) return [];
		const min = Math.min(...history.map((point) => point.price));
		const max = Math.max(...history.map((point) => point.price));
		const start = Date.parse(history[0].date);
		const span = Math.max(86_400_000, Date.parse(history.at(-1)!.date) - start);
		return history.map((point) => ({
			...point,
			x: 5 + ((Date.parse(point.date) - start) / span) * 290,
			y: max === min ? 35 : 60 - ((point.price - min) / (max - min)) * 50,
		}));
	});
	readonly segments = computed(() => {
		const segments: string[] = [];
		let previous = '';
		for (const point of this.coordinates()) {
			if (!previous || Date.parse(point.date) - Date.parse(previous) > 86_400_000)
				segments.push('');
			segments[segments.length - 1] += `${point.x},${point.y} `;
			previous = point.date;
		}
		return segments;
	});
	readonly historyDescription = computed(() =>
		this.history()
			.map((point) => `${effectiveDate(point.date)}: ${price(point.price, this.unit())}`)
			.join('; '),
	);
	readonly menuOpen = signal(false);
	readonly shareStatus = signal('');
	readonly disclosure = viewChild<ElementRef<HTMLElement>>('disclosure');
	readonly directionsButton = viewChild<ElementRef<HTMLButtonElement>>('directionsButton');
	readonly links = computed(() => {
		const station = this.station();
		return station
			? [
					{ name: 'Google Maps', url: googleDirections(station) },
					{ name: 'Waze', url: wazeDirections(station) },
					{ name: 'Apple Maps', url: appleDirections(station, station.name) },
				]
			: [];
	});
	private timer?: ReturnType<typeof setTimeout>;

	constructor() {
		if (this.browser)
			interval(60_000)
				.pipe(takeUntilDestroyed())
				.subscribe(() => this.now.set(this.clock.now()));
		// The alternative's name comes from the summaries cache: usually no request at all.
		toObservable(computed(() => this.ranking()?.alternative?.point[0] ?? null))
			.pipe(
				switchMap((id) =>
					id === null
						? of(null)
						: this.api.getStationSummaries([id]).pipe(map((rows) => rows[0]?.name ?? null)),
				),
				takeUntilDestroyed(),
			)
			.subscribe((name) => this.alternativeName.set(name));
		afterNextRender(() => {
			if (typeof ResizeObserver === 'undefined') return;
			const observer = new ResizeObserver(() => {
				const rect = this.host.nativeElement.getBoundingClientRect();
				this.resized.emit({ width: rect.width, height: rect.height });
			});
			observer.observe(this.host.nativeElement);
			this.destroyRef.onDestroy(() => observer.disconnect());
		});
		let focusedId: number | null | undefined;
		afterRenderEffect(() => {
			const id = this.station()?.id ?? null;
			this.error();
			if (id !== focusedId || this.error()) {
				this.card().nativeElement.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
				focusedId = id;
				this.menuOpen.set(false);
			}
		});
		this.destroyRef.onDestroy(() => clearTimeout(this.timer));
	}

	ordinal(rank: number): string {
		return `${rank}.ª`;
	}

	alternativeLabel(kind: 'next' | 'cheapest', other: number): string {
		if (kind === 'cheapest') return 'La más barata';
		return other === this.value() ? 'Igual de barata' : 'Siguiente más barata';
	}

	centsDifference(other: number): string {
		const value = this.value();
		if (value === null) return '';
		const cents = Math.round((other - value) * 1000) / 10;
		return cents === 0
			? 'mismo precio'
			: `${decimal(Math.abs(cents), 1)} céntimos ${cents > 0 ? 'más' : 'menos'}`;
	}

	escape(event: Event): void {
		const target = event.target as HTMLElement | null;
		if (
			target &&
			!this.host.nativeElement.contains(target) &&
			target.closest?.('input, select, textarea, [role="combobox"]')
		)
			return;
		if (this.menuOpen()) {
			event.stopPropagation();
			this.menuOpen.set(false);
			this.directionsButton()?.nativeElement.focus();
		} else this.close.emit();
	}

	outside(event: Event): void {
		if (!this.disclosure()?.nativeElement.contains(event.target as Node)) this.menuOpen.set(false);
	}

	async share(): Promise<void> {
		if (!this.browser) return;
		const station = this.station();
		if (!station) return;
		const text = shareText(station, this.selectedName(), this.value());
		const url = siteLink(STATION_PARAM, station.id);
		try {
			if (navigator.share) await navigator.share({ title: station.name, text, url });
			else {
				await navigator.clipboard.writeText(`${text}\n${url}`);
				if (this.destroyRef.destroyed) return;
				this.shareStatus.set('Copiado');
				clearTimeout(this.timer);
				this.timer = setTimeout(() => this.shareStatus.set(''), 2000);
			}
		} catch (error) {
			const cancelled =
				typeof error === 'object' &&
				error !== null &&
				'name' in error &&
				error.name === 'AbortError';
			if (!this.destroyRef.destroyed && !cancelled)
				this.shareStatus.set('No se pudo compartir. Vuelve a intentarlo.');
		}
	}
}
