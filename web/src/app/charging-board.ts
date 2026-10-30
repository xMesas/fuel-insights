import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { count } from './price-format';
import { bandCounts, chargingFreshness, POWER_BANDS, POWER_COLOURS } from './charging-functions';
import { ChargingPoint } from './price-models';

/**
 * The board of the electric mode, in the same place and style as the price board: how many charging sites of each
 * power class there are where the driver looks. Choosing a class shows it and the faster ones on the map and the
 * list.
 */
@Component({
	selector: 'app-charging-board',
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<p class="area">Puntos de recarga {{ scopeLabel() }}</p>
		<fieldset>
			<legend class="visually-hidden">Potencia mínima</legend>
			@for (row of rows(); track row.band) {
				<label [class.selected]="row.band === minBand()" [class.included]="row.band >= minBand()">
					<input
						type="radio"
						name="power"
						[value]="row.band"
						[checked]="row.band === minBand()"
						(change)="minBandChange.emit(row.band)"
					/>
					<span class="swatch" aria-hidden="true" [style.background]="colours[row.band]"></span>
					<span class="band-name"
						>{{ row.name }}<small>{{ row.range }}</small></span
					>
					<span class="led" aria-hidden="true">{{ row.count }}</span>
					<span class="visually-hidden"
						>{{ count(row.count) }} puntos de recarga{{
							row.band < minBand() ? ', ocultos en el mapa' : ''
						}}</span
					>
				</label>
			}
		</fieldset>
		<p class="hint">Elige una potencia para ver solo esa y las más rápidas.</p>
		<div class="list"><ng-content /></div>
		<p class="freshness">
			@if (updatedAt()) {
				{{ freshness(updatedAt()) }}.
			}
			Sin precios: el Ministerio no los publica.
		</p>
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
		fieldset {
			min-width: 0;
			padding: 0;
			margin: 0;
			border: 0;
		}
		.area,
		.hint,
		.freshness {
			color: var(--panel-ink-2);
			margin: 4px 16px 12px;
			font-size: 14px;
		}
		.area {
			display: flex;
			align-items: center;
			min-height: 44px;
			margin-top: 0;
		}
		.hint {
			margin: 12px 16px 0;
		}
		.freshness {
			margin: 8px 16px 4px;
		}
		/* The list inside the panel takes the panel's colours, as in the price board. */
		.list {
			--ink: var(--panel-ink);
			--ink-2: var(--panel-ink-2);
			--hairline: rgba(255, 255, 255, 0.12);
			--axis: rgba(255, 255, 255, 0.14);
			--surface: var(--panel-select);
			padding: 12px 16px 0;
		}
		label {
			position: relative;
			display: flex;
			align-items: center;
			gap: 12px;
			min-height: 56px;
			padding: 6px 12px;
			border-left: 4px solid transparent;
			cursor: pointer;
		}
		/* A class left out keeps its text readable (WCAG 1.4.3); only its colour dot and count fade. */
		label:not(.included) .swatch {
			opacity: 0.3;
		}
		label:not(.included) .led {
			color: var(--panel-ink-2);
		}
		label.selected {
			background: var(--panel-select);
			border-left-color: var(--led);
		}
		label:focus-within {
			outline: 2px solid var(--panel-ink);
			outline-offset: -4px;
		}
		input {
			position: absolute;
			opacity: 0;
			width: 1px;
			height: 1px;
		}
		.swatch {
			flex: 0 0 14px;
			height: 14px;
			border-radius: 50%;
		}
		.band-name {
			min-width: 0;
			font-size: 16px;
			line-height: 1.15;
		}
		.band-name small {
			display: block;
			margin-top: 2px;
			color: var(--panel-ink-2);
			font-size: 12px;
		}
		.led {
			margin-left: auto;
			white-space: nowrap;
			font:
				28px/1.4 DSEG7,
				monospace;
			color: var(--led);
		}
	`,
})
export class ChargingBoard {
	readonly sites = input<readonly ChargingPoint[]>([]);
	readonly scopeLabel = input('en la zona del mapa');
	readonly minBand = input(0);
	readonly updatedAt = input('');
	readonly minBandChange = output<number>();
	readonly colours = POWER_COLOURS;
	readonly count = count;
	readonly freshness = chargingFreshness;
	// Fastest first: the classes most drivers look for on a trip.
	readonly rows = computed(() => {
		const counts = bandCounts(this.sites());
		return POWER_BANDS.map((band, index) => ({
			...band,
			band: index,
			count: counts[index],
		})).reverse();
	});
}
