import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	inject,
	signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, catchError, exhaustMap, finalize, forkJoin, take, takeWhile, timer } from 'rxjs';
import { Account } from './account';
import { AlertForm, FavouriteStation, PriceAlert } from './alert-form';
import { FuelPicker } from './fuel-picker';
import { FuelPreference } from './fuel-preference';
import { ledParts, price } from './price-format';
import { Fuel } from './price-models';
import { Seo } from './seo';

@Component({
	selector: 'app-my-stations-page',
	imports: [FuelPicker, RouterLink, AlertForm],
	changeDetection: ChangeDetectionStrategy.OnPush,
	templateUrl: './my-stations-page.html',
	styleUrls: ['./account-controls.css', './my-stations-page.css'],
})
export class MyStationsPage {
	readonly account = inject(Account);
	readonly preference = inject(FuelPreference);
	private readonly http = inject(HttpClient);
	private readonly router = inject(Router);
	private readonly document = inject(DOCUMENT);
	private readonly destroyRef = inject(DestroyRef);
	readonly thanks = inject(ActivatedRoute).snapshot.queryParamMap.get('sin-anuncios') === 'gracias';
	readonly stations = signal<FavouriteStation[]>([]);
	readonly fuels = signal<Fuel[]>([]);
	readonly alerts = signal<PriceAlert[]>([]);
	readonly loading = signal(true);
	readonly error = signal('');
	readonly busy = signal(false);
	readonly planUnavailable = signal(false);
	readonly planMessage = signal('');
	readonly confirmingDeletion = signal(false);
	readonly price = price;
	readonly ledParts = ledParts;
	readonly sorted = computed(() =>
		[...this.stations()].sort(
			(a, b) =>
				(a.prices[this.preference.fuel()] ?? Infinity) -
				(b.prices[this.preference.fuel()] ?? Infinity),
		),
	);
	readonly selectedFuel = computed(() =>
		this.fuels().find((fuel) => fuel.code === this.preference.fuel()),
	);

	constructor() {
		inject(Seo).set(
			'Mis gasolineras | fuel-insights',
			'Tus gasolineras, alertas y cuenta.',
			'/mis-gasolineras',
			true,
		);
		effect(() => {
			if (this.account.account() === null)
				void this.router.navigate(['/entrar'], { queryParams: { volver: '/mis-gasolineras' } });
		});
		this.account
			.load()
			.pipe(takeUntilDestroyed())
			.subscribe({
				next: (account) => {
					if (!account) return;
					this.loadData();
					if (this.thanks && !account.premium) this.pollPremium();
				},
				error: () => {
					this.loading.set(false);
					this.error.set(
						'No hemos podido cargar tu cuenta. Recarga la página para intentarlo de nuevo.',
					);
				},
			});
	}

	loadData(): void {
		this.loading.set(true);
		this.error.set('');
		forkJoin({
			stations: this.http.get<FavouriteStation[]>('/api/me/favourites'),
			alerts: this.http.get<PriceAlert[]>('/api/me/alerts'),
			fuels: this.http.get<Fuel[]>('/api/fuels'),
		})
			.pipe(
				takeUntilDestroyed(this.destroyRef),
				finalize(() => this.loading.set(false)),
			)
			.subscribe({
				next: (data) => {
					this.stations.set(data.stations);
					this.alerts.set(data.alerts);
					this.fuels.set(data.fuels);
				},
				error: () =>
					this.error.set('No hemos podido cargar tus gasolineras y alertas. Inténtalo de nuevo.'),
			});
	}
	private pollPremium(): void {
		timer(2000, 2000)
			.pipe(
				take(5),
				exhaustMap(() => this.account.refresh().pipe(catchError(() => EMPTY))),
				takeWhile((account) => !account?.premium, true),
				takeUntilDestroyed(this.destroyRef),
			)
			.subscribe();
	}
	fuelName(code: string): string {
		const fuel = this.fuels().find((row) => row.code === code);
		return fuel?.shortName ?? fuel?.name ?? code;
	}
	unit(code: string): string {
		return this.fuels().find((fuel) => fuel.code === code)?.unit ?? 'l';
	}
	removeFavourite(id: number): void {
		this.error.set('');
		this.account
			.toggleFavourite(id)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					if (!this.account.favourites().some((row) => row.id === id))
						this.stations.update((rows) => rows.filter((row) => row.id !== id));
				},
				error: () => this.error.set('No hemos podido quitar la gasolinera. Inténtalo de nuevo.'),
			});
	}
	alertSaved(alert: PriceAlert): void {
		this.alerts.update((rows) => [...rows.filter((row) => row.id !== alert.id), alert]);
	}
	deleteAlert(id: number): void {
		if (this.busy()) return;
		this.busy.set(true);
		this.error.set('');
		this.http
			.delete(`/api/me/alerts/${id}`)
			.pipe(
				takeUntilDestroyed(this.destroyRef),
				finalize(() => this.busy.set(false)),
			)
			.subscribe({
				next: () => this.alerts.update((rows) => rows.filter((row) => row.id !== id)),
				error: (error) => {
					if (error.status === 404)
						this.alerts.update((rows) => rows.filter((row) => row.id !== id));
					else this.error.set('No hemos podido borrar la alerta. Inténtalo de nuevo.');
				},
			});
	}
	signOut(): void {
		if (this.busy()) return;
		this.busy.set(true);
		this.account
			.signOut()
			.pipe(
				takeUntilDestroyed(this.destroyRef),
				finalize(() => this.busy.set(false)),
			)
			.subscribe({
				error: () => this.error.set('No hemos podido cerrar la sesión. Inténtalo de nuevo.'),
			});
	}
	deleteAccount(): void {
		if (!this.confirmingDeletion() || this.busy()) return;
		this.busy.set(true);
		this.http
			.delete('/api/me')
			.pipe(
				takeUntilDestroyed(this.destroyRef),
				finalize(() => this.busy.set(false)),
			)
			.subscribe({
				next: () => this.account.clearSession(),
				error: () => this.error.set('No hemos podido borrar tu cuenta. Inténtalo de nuevo.'),
			});
	}
	openPlan(): void {
		if (this.busy() || this.planUnavailable()) return;
		this.busy.set(true);
		this.planMessage.set('');
		const action = this.account.account()?.premium ? 'portal' : 'checkout';
		this.http
			.post<{ url: string }>(`/api/me/premium/${action}`, null)
			.pipe(
				takeUntilDestroyed(this.destroyRef),
				finalize(() => this.busy.set(false)),
			)
			.subscribe({
				next: (result) => {
					this.document.location.href = result.url;
				},
				error: (error) => {
					this.planUnavailable.set(error.status === 503);
					this.planMessage.set(
						error.status === 503
							? 'Muy pronto.'
							: 'No hemos podido abrir el plan. Inténtalo de nuevo.',
					);
				},
			});
	}
}
