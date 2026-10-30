import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, PLATFORM_ID, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, switchMap } from 'rxjs';
import { Account } from './account';
import { Seo } from './seo';
import { signInPath } from './sign-in-path';

@Component({
	selector: 'app-confirm-sign-in-page',
	imports: [RouterLink],
	changeDetection: ChangeDetectionStrategy.OnPush,
	styleUrl: './sign-in.css',
	template: `
		<main>
			<h1>Confirmar entrada</h1>
			<button type="button" [disabled]="busy() || expired()" (click)="confirm()">
				Entrar en fuel-insights
			</button>
			<p aria-live="polite">{{ error() }}</p>
			@if (expired()) {
				<a routerLink="/entrar" [queryParams]="{ volver: back }">Pedir otro enlace</a>
			}
		</main>
	`,
})
export class ConfirmSignInPage {
	private readonly http = inject(HttpClient);
	private readonly account = inject(Account);
	private readonly router = inject(Router);
	private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
	private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;
	readonly back = signInPath(this.params.get('volver'));
	readonly busy = signal(false);
	readonly expired = signal(false);
	readonly error = signal('');

	constructor() {
		inject(Seo).set(
			'Confirmar entrada | fuel-insights',
			'Confirma tu entrada.',
			'/entrar/confirmar',
			true,
		);
	}

	confirm(): void {
		if (!this.browser || this.busy() || this.expired()) return;
		this.busy.set(true);
		this.error.set('');
		this.account
			.load()
			.pipe(
				switchMap(() =>
					this.http.post(
						'/api/auth/login',
						new HttpParams().set('token', this.params.get('token') ?? ''),
					),
				),
				switchMap(() => this.account.refresh()),
				finalize(() => this.busy.set(false)),
			)
			.subscribe({
				next: () => {
					let stored: string | null = null;
					try {
						stored = signInPath(localStorage.getItem('fuel-insights-return'));
						localStorage.removeItem('fuel-insights-return');
					} catch {}
					void this.router.navigateByUrl(this.back ?? stored ?? '/mis-gasolineras');
				},
				error: (error) => {
					this.expired.set(error.status === 401);
					this.error.set(
						error.status === 401
							? 'El enlace ha caducado o ya se usó.'
							: 'No hemos podido entrar. Inténtalo de nuevo.',
					);
				},
			});
	}
}
