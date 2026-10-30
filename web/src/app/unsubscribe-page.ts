import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { Seo } from './seo';

@Component({
	selector: 'app-unsubscribe-page',
	changeDetection: ChangeDetectionStrategy.OnPush,
	styleUrl: './sign-in.css',
	template: `
		<main>
			<h1>Baja de una alerta</h1>
			@if (!done()) {
				<button type="button" [disabled]="busy() || invalid()" (click)="unsubscribe()">
					Dejar de recibir esta alerta
				</button>
			}
			<p aria-live="polite">{{ done() ? 'Listo: no recibirás más esta alerta.' : error() }}</p>
		</main>
	`,
})
export class UnsubscribePage {
	private readonly http = inject(HttpClient);
	private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;
	readonly done = signal(false);
	readonly busy = signal(false);
	readonly invalid = signal(!this.params.get('alerta') || !this.params.get('firma'));
	readonly error = signal(this.invalid() ? 'Este enlace no es válido.' : '');

	constructor() {
		inject(Seo).set(
			'Baja de alerta | fuel-insights',
			'Deja de recibir esta alerta.',
			'/alertas/baja',
			true,
		);
	}

	unsubscribe(): void {
		if (this.busy() || this.done() || this.invalid()) return;
		this.busy.set(true);
		this.error.set('');
		const params = new HttpParams()
			.set('alert', this.params.get('alerta')!)
			.set('signature', this.params.get('firma')!);
		this.http
			.post('/api/alerts/unsubscribe', null, { params })
			.pipe(finalize(() => this.busy.set(false)))
			.subscribe({
				next: () => this.done.set(true),
				error: (error) => {
					this.invalid.set(error.status === 404);
					this.error.set(
						error.status === 404
							? 'Este enlace no es válido.'
							: 'No hemos podido dar de baja la alerta. Inténtalo de nuevo.',
					);
				},
			});
	}
}
