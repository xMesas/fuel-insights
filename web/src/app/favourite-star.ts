import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Account } from './account';

@Component({
	selector: 'app-favourite-star',
	imports: [RouterLink],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		@if (browser() && account.account() === null) {
			<a routerLink="/entrar" [queryParams]="{ volver: router.url }"
				><span aria-hidden="true">☆</span> Guardar</a
			>
		} @else {
			<button
				type="button"
				[disabled]="!browser() || !account.account() || !account.favouritesReady() || pending()"
				[attr.aria-pressed]="saved()"
				(click)="toggle()"
			>
				<span aria-hidden="true">{{ saved() ? '★' : '☆' }}</span>
				{{ saved() ? 'Guardada' : 'Guardar' }}
			</button>
		}
		<span aria-live="polite">{{ error() }}</span>
	`,
	styles: `
		:host {
			display: inline-block;
		}
		a,
		button {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			min-height: 44px;
			padding: 8px 12px;
			box-sizing: border-box;
			border: 1px solid var(--hairline);
			border-radius: 8px;
			background: var(--surface);
			color: var(--ink);
			font: inherit;
			text-decoration: none;
			cursor: pointer;
		}
		button:disabled {
			cursor: default;
		}
		a:focus-visible,
		button:focus-visible {
			outline: 2px solid var(--focus);
			outline-offset: 3px;
		}
		span[aria-live] {
			display: block;
			font-size: 14px;
		}
	`,
})
export class FavouriteStar {
	readonly stationId = input.required<number>();
	readonly account = inject(Account);
	readonly router = inject(Router);
	readonly browser = signal(false);
	readonly error = signal('');
	readonly saved = computed(() =>
		this.account.favourites().some((row) => row.id === this.stationId()),
	);
	readonly pending = computed(() => this.account.pending().includes(this.stationId()));

	constructor() {
		afterNextRender(() => this.browser.set(true));
	}

	toggle(): void {
		this.error.set('');
		this.account.toggleFavourite(this.stationId()).subscribe({
			error: (error) =>
				this.error.set(
					error.status === 409
						? 'Puedes guardar hasta 50 gasolineras.'
						: 'No hemos podido guardar el cambio. Inténtalo de nuevo.',
				),
		});
	}
}
