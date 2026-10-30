import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { email, form, FormField, required } from '@angular/forms/signals';
import { finalize, switchMap } from 'rxjs';
import { Account } from './account';
import { Seo } from './seo';
import { signInPath } from './sign-in-path';

@Component({
	selector: 'app-sign-in-page',
	imports: [RouterLink, FormField],
	changeDetection: ChangeDetectionStrategy.OnPush,
	styleUrl: './sign-in.css',
	template: `
		<main>
			<h1>Entrar</h1>
			<p>
				Sin contraseñas: te mandamos un enlace para entrar. Guardamos solo tu email, tus gasolineras
				y tus alertas. <a routerLink="/privacidad">Privacidad</a>.
			</p>
			@if (sent()) {
				<p role="status">
					Te hemos enviado un enlace a {{ sent() }}. Caduca en 15 minutos. Si no llega, mira en
					spam.
				</p>
				<a routerLink="/entrar" [queryParams]="{ volver: back }" (click)="sent.set('')"
					>Usar otro email</a
				>
			} @else {
				<form (submit)="$event.preventDefault(); send()">
					<label for="email">Email</label>
					<input id="email" type="email" autocomplete="email" [formField]="emailForm.email" />
					<button type="submit" [disabled]="busy()">Enviarme el enlace</button>
				</form>
			}
			<p aria-live="polite">{{ error() }}</p>
		</main>
	`,
})
export class SignInPage {
	private readonly http = inject(HttpClient);
	private readonly account = inject(Account);
	readonly back = signInPath(inject(ActivatedRoute).snapshot.queryParamMap.get('volver'));
	readonly model = signal({ email: '' });
	readonly emailForm = form(this.model, (path) => {
		required(path.email);
		email(path.email);
	});
	readonly sent = signal('');
	readonly error = signal('');
	readonly busy = signal(false);

	constructor() {
		inject(Seo).set('Entrar | fuel-insights', 'Entra con un enlace por email.', '/entrar', true);
	}

	send(): void {
		if (this.busy()) return;
		this.busy.set(true);
		this.error.set('');
		const email = this.model().email.trim();
		// The email contract only accepts email; keep the destination in this browser for its link.
		try {
			if (this.back) localStorage.setItem('fuel-insights-return', this.back);
			else localStorage.removeItem('fuel-insights-return');
		} catch {}
		this.account
			.load()
			.pipe(
				switchMap(() => this.http.post('/api/auth/link', new HttpParams().set('email', email))),
				finalize(() => this.busy.set(false)),
			)
			.subscribe({
				next: () => this.sent.set(email),
				error: (error) =>
					this.error.set(
						error.status === 400
							? 'Revisa el email.'
							: 'No hemos podido enviar el email. Inténtalo dentro de un rato.',
					),
			});
	}
}
