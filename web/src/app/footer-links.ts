import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ProvinceLink } from './pages/page-models';

@Component({
	selector: 'app-footer-links',
	imports: [RouterLink],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<div class="page-links" aria-label="Precios y estadísticas">
			<a routerLink="/precio-diesel-hoy">Precio del diésel</a>
			<a routerLink="/precio-gasolina-hoy">Precio de la gasolina</a>
			<a routerLink="/estadisticas">Estadísticas</a>
			<a routerLink="/aviso-legal">Aviso legal</a>
			<a routerLink="/privacidad">Privacidad</a>
			<a routerLink="/cookies">Cookies</a>
		</div>
		@if (provinces().length) {
			<details>
				<summary>Gasolineras por provincia</summary>
				<ul>
					@for (province of provinces(); track province.id) {
						<li>
							<a [routerLink]="['/gasolineras', province.slug]">{{ province.name }}</a>
						</li>
					}
				</ul>
			</details>
		}
	`,
	styles: `
		:host {
			display: block;
			margin-bottom: 24px;
		}
		.page-links {
			display: flex;
			flex-wrap: wrap;
			gap: 8px 24px;
		}
		a {
			display: inline-block;
			color: var(--ink);
			padding-block: 12px;
			text-underline-offset: 3px;
		}
		a:focus-visible,
		summary:focus-visible {
			outline: 2px solid var(--focus);
			outline-offset: 3px;
		}
		summary {
			padding-block: 12px;
			cursor: pointer;
			color: var(--ink);
		}
		ul {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
			list-style: none;
			padding: 0;
			margin: 0;
			gap: 0 16px;
		}
	`,
})
export class FooterLinks {
	readonly provinces = signal<ProvinceLink[]>([]);
	constructor() {
		inject(HttpClient)
			.get<ProvinceLink[]>('/api/pages/provinces')
			.pipe(
				catchError(() => of([])),
				takeUntilDestroyed(),
			)
			.subscribe((rows) => this.provinces.set(rows));
	}
}
