import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	output,
	signal,
} from '@angular/core';
import { FuelPreference } from './fuel-preference';
import { Fuel } from './price-models';

const PRIMARY = ['GASOLEO_A', 'GASOLINA_95_E5'];
const normalize = (value: string) =>
	value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();

@Component({
	selector: 'app-fuel-picker',
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<fieldset role="radiogroup" aria-label="Tu carburante">
			@for (fuel of primary(); track fuel.code; let index = $index) {
				<label [class.selected]="current() === fuel.code">
					<input
						type="radio"
						[name]="id()"
						[value]="fuel.code"
						[checked]="current() === fuel.code"
						(change)="choose(fuel)"
						(keydown)="moveRadio($event, index)"
					/>
					{{ fuel.shortName ?? fuel.name }}
				</label>
			}
		</fieldset>
		<div class="other" [class.selected]="otherSelected()">
			<input
				role="combobox"
				aria-label="Otros"
				placeholder="Otros"
				autocomplete="off"
				[attr.aria-controls]="id() + '-options'"
				aria-autocomplete="list"
				[attr.aria-expanded]="open()"
				[attr.aria-activedescendant]="open() && active() >= 0 ? id() + '-' + active() : null"
				[value]="open() ? query() : otherSelected()"
				(focus)="expand()"
				(click)="expand()"
				(input)="query.set($any($event.target).value); active.set(-1); open.set(true)"
				(keydown)="navigate($event)"
				(blur)="open.set(false)"
			/>
			@if (open()) {
				<ul
					role="listbox"
					aria-label="Otros carburantes"
					[id]="id() + '-options'"
					(pointerdown)="$event.preventDefault()"
				>
					@for (fuel of matches(); track fuel.code; let index = $index) {
						<li
							role="option"
							[id]="id() + '-' + index"
							[attr.aria-selected]="current() === fuel.code"
							[class.active]="active() === index"
							(click)="choose(fuel)"
						>
							{{ fuel.shortName ?? fuel.name }}
						</li>
					} @empty {
						<li role="presentation">Sin resultados</li>
					}
				</ul>
			}
		</div>
	`,
	styles: `
		:host {
			display: block;
			min-width: 0;
			color: var(--picker-ink, var(--ink));
		}
		fieldset {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 8px;
			border: 0;
			padding: 0;
			margin: 0;
			min-width: 0;
		}
		label,
		.other {
			border: 1px solid var(--picker-border, var(--axis));
			border-radius: 8px;
			background: var(--picker-bg, var(--surface));
		}
		label {
			position: relative;
			min-height: 48px;
			display: grid;
			place-items: center;
			padding: 6px 10px;
			cursor: pointer;
		}
		label input {
			position: absolute;
			opacity: 0;
			width: 1px;
			height: 1px;
		}
		.selected {
			border-color: var(--picker-selected, var(--ink));
			background: var(--picker-bg-selected, var(--surface));
		}
		label:focus-within,
		.other:focus-within {
			outline: 2px solid var(--picker-ink, var(--focus));
			outline-offset: 2px;
		}
		.other {
			position: relative;
			margin-top: 8px;
		}
		.other input {
			width: 100%;
			min-width: 0;
			box-sizing: border-box;
			min-height: 44px;
			padding: 8px 12px;
			border: 0;
			background: transparent;
			color: inherit;
			font: inherit;
		}
		input::placeholder {
			color: inherit;
			opacity: 1;
		}
		ul {
			position: absolute;
			z-index: 6;
			top: 100%;
			left: 0;
			right: 0;
			max-height: 260px;
			overflow: auto;
			list-style: none;
			padding: 4px;
			margin: 4px 0;
			border: 1px solid var(--picker-border, var(--axis));
			border-radius: 8px;
			background: var(--picker-bg, var(--surface));
		}
		li {
			min-height: 44px;
			padding: 10px;
			box-sizing: border-box;
			cursor: pointer;
		}
		li.active,
		li:hover {
			outline: 2px solid currentColor;
			outline-offset: -2px;
		}
	`,
})
export class FuelPicker {
	readonly preference = inject(FuelPreference);
	readonly fuels = input<Fuel[]>([]);
	readonly selected = input<string>();
	readonly changed = output<string>();
	readonly id = input('fuel-picker');
	readonly current = computed(() => this.selected() ?? this.preference.fuel());
	readonly primary = computed(() =>
		PRIMARY.flatMap((code) => this.fuels().find((fuel) => fuel.code === code) ?? []),
	);
	readonly others = computed(() => this.fuels().filter((fuel) => !PRIMARY.includes(fuel.code)));
	readonly otherSelected = computed(() => {
		const fuel = this.others().find((fuel) => fuel.code === this.current());
		return fuel ? (fuel.shortName ?? fuel.name) : '';
	});
	readonly query = signal('');
	readonly open = signal(false);
	readonly active = signal(-1);
	readonly matches = computed(() =>
		this.others().filter((fuel) =>
			normalize(fuel.shortName ?? fuel.name).includes(normalize(this.query())),
		),
	);
	choose(fuel: Fuel): void {
		this.preference.choose(fuel.code);
		this.changed.emit(fuel.code);
		this.open.set(false);
	}
	expand(): void {
		if (this.open()) return;
		this.query.set('');
		this.active.set(-1);
		this.open.set(true);
	}
	moveRadio(event: KeyboardEvent, index: number): void {
		if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key))
			return;
		event.preventDefault();
		const target =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? this.primary().length - 1
					: (index + 1) % this.primary().length;
		this.choose(this.primary()[target]);
		(event.target as HTMLElement).closest('fieldset')?.querySelectorAll('input')[target].focus();
	}
	navigate(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.stopPropagation();
			this.open.set(false);
			return;
		}
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			this.expand();
			const length = this.matches().length;
			this.active.set(
				length
					? this.active() < 0
						? event.key === 'ArrowDown'
							? 0
							: length - 1
						: (this.active() + (event.key === 'ArrowDown' ? 1 : -1) + length) % length
					: -1,
			);
		} else if (event.key === 'Enter' && this.open() && this.matches().length) {
			event.preventDefault();
			this.choose(this.matches()[Math.max(0, this.active())]);
		}
	}
}
