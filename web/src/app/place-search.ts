import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	input,
	output,
	signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, of, switchMap, timer } from 'rxjs';
import { PricesApi } from './prices-api';
import { Area, GeocodeResult, Place, SearchOrigin } from './price-models';
import { searchPlaces } from './place-functions';

export const SEARCH_RADII = [5, 10, 25, 50];

@Component({
	selector: 'app-place-search',
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<div class="search-field">
			<svg class="magnifier" viewBox="0 0 24 24" aria-hidden="true">
				<circle cx="10" cy="10" r="6" />
				<path d="m15 15 6 6" />
			</svg>
			<label class="visually-hidden" for="place-input">Dirección o población</label>
			<input
				#placeInput
				id="place-input"
				role="combobox"
				autocomplete="off"
				placeholder="Busca una dirección o población"
				aria-autocomplete="list"
				maxlength="100"
				aria-controls="place-options"
				[attr.aria-expanded]="expanded()"
				[attr.aria-activedescendant]="
					expanded() && active() >= 0 && active() < optionCount()
						? 'place-option-' + active()
						: null
				"
				[value]="query()"
				(focus)="focus()"
				(input)="type($event)"
				(keydown)="navigate($event)"
				(blur)="open.set(false)"
			/>
			@if (query()) {
				<button class="clear" aria-label="Borrar búsqueda" (click)="clear(); placeInput.focus()">
					×
				</button>
			}
			<button aria-label="Usar mi ubicación" title="Usar mi ubicación" (click)="useLocation()">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="12" cy="12" r="6" />
					<path d="M12 2v5m0 10v5M2 12h5m10 0h5" />
				</svg>
			</button>
		</div>
		@if (open() && query().trim()) {
			@if (loading()) {
				<p role="status">Cargando poblaciones…</p>
			} @else if (error()) {
				<p role="alert">
					No se pudieron cargar las poblaciones. Vuelve a buscar o usa tu ubicación.
				</p>
			} @else if (!suggestions().length && !geocoded().length && !geocoding()) {
				<p role="status">Sin resultados. Prueba con otro nombre o usa tu ubicación.</p>
			}
		}
		<ul
			id="place-options"
			role="listbox"
			aria-label="Direcciones y poblaciones"
			[hidden]="!expanded()"
			(pointerdown)="$event.preventDefault()"
		>
			@if (!query().trim()) {
				<li
					role="option"
					id="place-option-0"
					[attr.aria-selected]="active() === 0"
					(click)="useLocation()"
				>
					Usar mi ubicación
				</li>
			}
			@for (place of suggestions(); track place[0] + place[1]; let index = $index) {
				<li
					role="option"
					[id]="'place-option-' + index"
					[attr.aria-selected]="active() === index"
					(click)="select(place)"
				>
					<span>{{ place[0] }}</span
					><small>{{ province(place[1]) }}</small>
				</li>
			}
			@if (geocoded().length) {
				<li role="presentation" class="group-title">Direcciones y lugares</li>
				@for (result of geocoded(); track result.id + result.type; let index = $index) {
					<li
						role="option"
						[id]="'place-option-' + (suggestions().length + index)"
						[attr.aria-selected]="active() === suggestions().length + index"
						(click)="selectGeocode(result)"
					>
						<span>{{ result.label }}</span
						><small>{{ result.kind }}</small>
					</li>
				}
			}
		</ul>
		@if (pointError()) {
			<p role="alert">No pudimos situar ese lugar. Prueba otra dirección o usa tu ubicación.</p>
		}
		@if (origin()) {
			<fieldset class="segments" role="radiogroup" aria-label="Distancia">
				<legend class="visually-hidden">Distancia</legend>
				@for (distance of radii; track distance) {
					<label [class.selected]="radius() === distance"
						><input
							type="radio"
							name="radius"
							[value]="distance"
							[checked]="radius() === distance"
							(change)="radiusChange.emit(distance)"
							(keydown)="moveRadius($event, distance)"
						/>{{ distance }} km</label
					>
				}
			</fieldset>
		}
	`,
	styles: `
		:host {
			display: block;
			position: relative;
			min-width: 0;
		}
		.search-field {
			height: 52px;
			display: flex;
			align-items: center;
			border: 1px solid var(--hairline);
			border-radius: 12px;
			background: var(--surface);
			padding: 3px;
			gap: 2px;
		}
		svg {
			width: 22px;
			height: 22px;
			fill: none;
			stroke: currentColor;
			stroke-width: 2;
			flex-shrink: 0;
		}
		.magnifier {
			margin: 0 8px;
			color: var(--ink-2);
		}
		input[role='combobox'] {
			min-width: 0;
			width: 100%;
			flex: 1;
			border: 0;
			font: inherit;
			color: var(--ink);
			background: transparent;
			height: 44px;
		}
		input::placeholder {
			color: var(--ink-2);
			opacity: 1;
		}
		button {
			display: grid;
			place-items: center;
			padding: 0;
			min-width: 44px;
			width: 44px;
			height: 44px;
			flex-shrink: 0;
			border: 0;
			background: transparent;
		}
		.clear {
			font-size: 24px;
		}
		ul {
			position: absolute;
			z-index: 4;
			top: 52px;
			left: 0;
			right: 0;
			list-style: none;
			padding: 4px;
			margin: 4px 0;
			border: 1px solid var(--hairline);
			border-radius: 12px;
			background: var(--surface);
			max-height: 320px;
			overflow-y: auto;
		}
		li {
			cursor: pointer;
			padding: 10px 12px;
			min-height: 44px;
		}
		.group-title {
			min-height: 0;
			font-size: 14px;
			color: var(--ink-2);
			cursor: default;
		}
		li[aria-selected='true'] {
			outline: 2px solid var(--focus);
			outline-offset: -2px;
			border-radius: 8px;
		}
		small {
			display: block;
			color: var(--ink-2);
			font-size: 14px;
		}
		p {
			font-size: 14px;
			color: var(--ink-2);
			margin: 8px 0;
		}
		.segments {
			display: flex;
			padding: 0;
			border: 0;
			margin: 12px 0 0;
			gap: 4px;
		}
		.segments label {
			flex: 1;
			position: relative;
			min-height: 44px;
			display: grid;
			place-items: center;
			border-radius: 8px;
			cursor: pointer;
		}
		.segments .selected {
			background: var(--surface);
			box-shadow: inset 0 0 0 1px var(--axis);
		}
		.segments label:focus-within {
			outline: 2px solid var(--focus);
			outline-offset: 2px;
		}
		input[type='radio'] {
			position: absolute;
			opacity: 0;
			width: 1px;
			height: 1px;
		}
	`,
})
export class PlaceSearch {
	private readonly api = inject(PricesApi);
	private readonly destroyRef = inject(DestroyRef);
	readonly origin = input<SearchOrigin | null>(null);
	readonly radius = input(10);
	readonly areas = input<Area[]>([]);
	readonly choose = output<SearchOrigin | null>();
	readonly radiusChange = output<number>();
	readonly radii = SEARCH_RADII;
	readonly query = signal('');
	readonly open = signal(false);
	readonly active = signal(-1);
	readonly loading = signal(false);
	readonly error = signal(false);
	readonly locate = output<void>();
	private loaded = false;
	private readonly places = signal<Place[]>([]);
	private readonly actions = new Subject<string | GeocodeResult>();
	readonly geocoded = signal<GeocodeResult[]>([]);
	readonly geocoding = signal(false);
	readonly pointError = signal(false);
	readonly suggestions = computed(() => searchPlaces(this.places(), this.query()));
	readonly optionCount = computed(() =>
		!this.query().trim() ? 1 : this.suggestions().length + this.geocoded().length,
	);
	readonly expanded = computed(() => this.open() && this.optionCount() > 0);
	constructor() {
		this.actions
			.pipe(
				switchMap((action) =>
					typeof action !== 'string'
						? this.api.geocodePoint(action).pipe(
								catchError(() => {
									this.pointError.set(true);
									return of(null);
								}),
							)
						: action.trim().length < 3 || action.trim().length > 100
							? of(null)
							: timer(300).pipe(
									switchMap(() => this.api.geocode(action.trim())),
									catchError(() => of([])),
								),
				),
				takeUntilDestroyed(),
			)
			.subscribe((result) => {
				this.geocoding.set(false);
				if (Array.isArray(result)) {
					this.geocoded.set(result);
					this.active.set(-1);
				} else if (result) this.finishGeocode(result);
			});
		effect(() => {
			this.query.set(this.origin()?.name ?? '');
			this.actions.next('');
			this.geocoded.set([]);
			this.open.set(false);
			this.active.set(-1);
		});
	}
	focus(): void {
		this.load();
		this.open.set(true);
	}
	type(event: Event): void {
		this.query.set((event.target as HTMLInputElement).value);
		this.geocoded.set([]);
		this.pointError.set(false);
		this.actions.next(this.query());
		this.geocoding.set(this.query().trim().length >= 3 && this.query().trim().length <= 100);
		if (!this.query().trim()) {
			this.clear();
			this.open.set(true);
			return;
		}
		this.active.set(-1);
		this.open.set(true);
		this.load();
	}
	private load(): void {
		if (this.loaded || this.loading()) return;
		this.loading.set(true);
		this.error.set(false);
		this.api
			.getPlaces()
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (places) => {
					this.places.set(places);
					this.loaded = true;
					this.loading.set(false);
				},
				error: () => {
					this.error.set(true);
					this.loading.set(false);
				},
			});
	}
	select(place: Place): void {
		this.actions.next('');
		this.geocoded.set([]);
		this.query.set(place[0]);
		this.open.set(false);
		this.choose.emit({ name: place[0], latitude: place[2], longitude: place[3] });
	}
	clear(): void {
		this.actions.next('');
		this.geocoded.set([]);
		this.pointError.set(false);
		this.query.set('');
		this.open.set(false);
		this.active.set(-1);
		this.choose.emit(null);
	}
	province(id: string): string {
		return this.areas().find((area) => area.id === id)?.name ?? id;
	}
	useLocation(): void {
		this.actions.next('');
		this.open.set(false);
		this.locate.emit();
	}
	selectGeocode(result: GeocodeResult): void {
		this.actions.next('');
		this.open.set(false);
		this.pointError.set(false);
		if (result.latitude === null || result.longitude === null) this.actions.next(result);
		else this.finishGeocode(result);
	}
	private finishGeocode(result: GeocodeResult): void {
		if (result.latitude === null || result.longitude === null) {
			this.pointError.set(true);
			return;
		}
		this.geocoded.set([]);
		this.open.set(false);
		this.query.set(result.label);
		this.choose.emit({
			name: result.label,
			latitude: result.latitude,
			longitude: result.longitude,
		});
	}
	navigate(event: KeyboardEvent): void {
		const count = this.optionCount();
		if (event.key === 'Escape') {
			this.open.set(false);
			if (!this.query().trim()) this.clear();
			return;
		}
		if (event.key === 'Tab') {
			this.open.set(false);
			return;
		}
		if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count) {
			event.preventDefault();
			this.open.set(true);
			this.active.set(
				(this.active() + (event.key === 'ArrowDown' ? 1 : this.active() < 0 ? 0 : -1) + count) %
					count,
			);
		} else if (event.key === 'Enter' && this.expanded()) {
			event.preventDefault();
			const index = Math.max(0, this.active());
			if (!this.query().trim()) this.useLocation();
			else if (index < this.suggestions().length) this.select(this.suggestions()[index]);
			else this.selectGeocode(this.geocoded()[index - this.suggestions().length]);
		}
	}
	moveRadius(event: KeyboardEvent, radius: number): void {
		const index = SEARCH_RADII.indexOf(radius);
		const next: Record<string, number> = {
			ArrowRight: (index + 1) % 4,
			ArrowDown: (index + 1) % 4,
			ArrowLeft: (index + 3) % 4,
			ArrowUp: (index + 3) % 4,
			Home: 0,
			End: 3,
		};
		if (!(event.key in next)) return;
		event.preventDefault();
		this.radiusChange.emit(SEARCH_RADII[next[event.key]]);
		(event.target as HTMLElement)
			.closest('fieldset')
			?.querySelectorAll<HTMLInputElement>('input')
			[next[event.key]].focus();
	}
}
