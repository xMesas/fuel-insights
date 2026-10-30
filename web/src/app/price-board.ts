import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FuelPicker } from './fuel-picker';
import { CurrentStats, Fuel, ZoneStats } from './price-models';
import { decimal, freshness, price } from './price-format';

interface BoardFigures {
	averagePrice: number;
	weekAgo: number | null;
}

/** How the zone's average moved in a week, in cents: "baja 1,2 cént. en 7 días". */
export function weekText(now: number, weekAgo: number | null): string {
	if (weekAgo === null) return '';
	const cents = Math.round((now - weekAgo) * 1000) / 10;
	if (cents === 0) return 'igual que hace 7 días';
	return `${cents > 0 ? 'sube' : 'baja'} ${decimal(Math.abs(cents), 1)} cént. en 7 días`;
}

/**
 * The price board answers one question for one driver: where is my fuel cheapest in what I am looking at. The fuel
 * is chosen once (the other fuels' prices would only be noise); the cheapest stations come right below, from the
 * list projected inside the panel, with the zone's average as context.
 */
@Component({
	selector: 'app-price-board',
	imports: [FuelPicker],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		@if (focusName(); as name) {
			<p class="focus">
				<span>{{ name }}, marcada en el mapa</span>
				<button
					class="clear"
					(click)="clearScope.emit()"
					[attr.aria-label]="'Quitar ' + name + ' del mapa'"
				>
					×
				</button>
			</p>
		}
		<app-fuel-picker [fuels]="fuels()" [selected]="selected()" (changed)="choose.emit($event)" />
		<p class="context">
			@if (unsold(); as name) {
				No hay gasolineras con {{ name }} {{ scopeLabel() }}.
			} @else if (figures(selected()); as figure) {
				Media {{ scopeLabel() }}: {{ price(figure.averagePrice, unit()) }}{{ weekSentence(figure) }}
			}
		</p>
		<div class="list"><ng-content /></div>
		<p class="freshness">{{ freshness(stats().updatedAt) }}</p>
	`,
	styles: `
		:host {
			display: block;
			min-width: 0;
			padding: 12px 0;
			border: 1px solid rgba(255, 255, 255, 0.14);
			border-radius: 12px;
			background: var(--panel);
			color: var(--panel-ink);
		}
		app-fuel-picker {
			margin: 0 16px;
			--picker-ink: var(--panel-ink);
			--picker-border: var(--panel-ink-2);
			--picker-bg: var(--panel);
			--picker-bg-selected: var(--panel-select);
			--picker-selected: var(--led);
		}
		.focus,
		.context,
		.freshness {
			color: var(--panel-ink-2);
			margin: 12px 16px;
			font-size: 14px;
		}
		.focus {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			margin-top: 0;
		}
		.context:empty {
			display: none;
		}
		.clear {
			flex-shrink: 0;
			min-width: 44px;
			min-height: 44px;
			color: var(--panel-ink);
			background: transparent;
			border: 1px solid rgba(255, 255, 255, 0.14);
			border-radius: 8px;
		}
		/* The list inside the panel takes the panel's colours. */
		.list {
			--ink: var(--panel-ink);
			--ink-2: var(--panel-ink-2);
			--hairline: rgba(255, 255, 255, 0.12);
			--axis: rgba(255, 255, 255, 0.14);
			--surface: var(--panel-select);
			padding: 0 16px;
		}
	`,
})
export class PriceBoard {
	readonly catalogue = input<Fuel[]>([]);
	readonly fuels = computed(() =>
		this.catalogue().length ? this.catalogue() : this.stats().fuels.map((row) => row.fuel),
	);
	// Said only once the zone's figures are known: the top 5 below shows the same from the other side.
	readonly unsold = computed(() =>
		!this.zone() || this.figures(this.selected())
			? null
			: (this.fuels().find((fuel) => fuel.code === this.selected())?.shortName ??
				this.fuels().find((fuel) => fuel.code === this.selected())?.name ??
				null),
	);
	readonly unit = computed(
		() => this.stats().fuels.find((row) => row.fuel.code === this.selected())?.fuel.unit ?? 'l',
	);
	readonly stats = input.required<CurrentStats>();
	// The figures of the zone on screen; null while they load or if they failed, and then the board says nothing.
	readonly zone = input<ZoneStats | null>(null);
	readonly scopeLabel = input('en España');
	// A province outlined on the map, which the driver can clear from here.
	readonly focusName = input<string | null>(null);
	readonly selected = input('GASOLEO_A');
	readonly choose = output<string>();
	readonly clearScope = output<void>();
	readonly price = price;
	readonly freshness = freshness;

	figures(code: string): BoardFigures | null {
		const row = this.zone()?.fuels.find((fuel) => fuel.fuel.code === code);
		return row ? { averagePrice: row.averagePrice, weekAgo: row.weekAgoAverage } : null;
	}

	weekSentence(figure: BoardFigures): string {
		const text = weekText(figure.averagePrice, figure.weekAgo);
		return text ? `. ${text[0].toUpperCase()}${text.slice(1)}.` : '.';
	}
}
