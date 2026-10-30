import { HttpClient } from '@angular/common/http';
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
import { form, FormField, max, min, required } from '@angular/forms/signals';
import { finalize } from 'rxjs';
import { Account } from './account';
import { FuelPicker } from './fuel-picker';
import { Fuel } from './price-models';

export interface FavouriteStation {
	id: number;
	name: string;
	town: string;
	provinceId: string;
	prices: Record<string, number>;
}
export interface PriceAlert {
	id: number;
	stationId: number;
	stationName: string;
	town: string;
	fuel: string;
	threshold: number;
	currentPrice: number | null;
	lastSentAt: string | null;
}

@Component({
	selector: 'app-alert-form',
	imports: [FormField, FuelPicker],
	changeDetection: ChangeDetectionStrategy.OnPush,
	styleUrl: './account-controls.css',
	template: `
		<form (submit)="$event.preventDefault(); save()">
			<p>Carburante de la alerta</p>
			<app-fuel-picker
				[id]="'alert-fuel-' + station().id"
				[fuels]="availableFuels()"
				[selected]="model().fuel"
				(changed)="chooseFuel($event)"
			/>
			<label [for]="'threshold-' + station().id">Precio máximo (€/{{ unit() }})</label>
			<input
				[id]="'threshold-' + station().id"
				type="number"
				step="0.001"
				[formField]="fields.threshold"
			/>
			<button type="submit" [disabled]="busy() || fields().invalid()">Guardar alerta</button>
			<p aria-live="polite">{{ error() }}</p>
		</form>
	`,
})
export class AlertForm {
	private readonly http = inject(HttpClient);
	private readonly account = inject(Account);
	readonly station = input.required<FavouriteStation>();
	readonly fuels = input.required<Fuel[]>();
	readonly selected = input.required<string>();
	readonly saved = output<PriceAlert>();
	readonly availableFuels = computed(() =>
		this.fuels().filter((fuel) => this.station().prices[fuel.code] != null),
	);
	readonly model = linkedSignal(() => {
		const station = this.station();
		const fuel =
			station.prices[this.selected()] != null
				? this.selected()
				: (Object.keys(station.prices)[0] ?? '');
		return {
			fuel,
			threshold: Math.max(0.1, Math.round(((station.prices[fuel] ?? 0.12) - 0.02) * 1000) / 1000),
		};
	});
	readonly fields = form(this.model, (path) => {
		required(path.fuel);
		min(path.threshold, 0.1);
		max(path.threshold, 9.999);
		required(path.threshold);
	});
	readonly busy = signal(false);
	readonly error = signal('');
	chooseFuel(fuel: string): void {
		this.model.set({
			fuel,
			threshold: Math.max(
				0.1,
				Math.round(((this.station().prices[fuel] ?? 0.12) - 0.02) * 1000) / 1000,
			),
		});
	}
	unit(): string {
		return this.fuels().find((fuel) => fuel.code === this.model().fuel)?.unit ?? 'l';
	}
	save(): void {
		if (this.busy() || this.fields().invalid()) return;
		this.busy.set(true);
		this.error.set('');
		this.http
			.post<PriceAlert>('/api/me/alerts', { stationId: this.station().id, ...this.model() })
			.pipe(finalize(() => this.busy.set(false)))
			.subscribe({
				next: (alert) => this.saved.emit(alert),
				error: (error) =>
					this.error.set(
						error.status === 409
							? `Ya tienes ${this.account.account()?.alertLimit ?? 3} alertas: borra una para crear otra.`
							: 'No hemos podido guardar la alerta. Inténtalo de nuevo.',
					),
			});
	}
}
