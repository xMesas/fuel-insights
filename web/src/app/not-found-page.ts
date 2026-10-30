import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { Seo } from './seo';

/** Any address the site does not have; the server answers it with a 404 status. */
@Component({
	selector: 'app-not-found-page',
	imports: [RouterLink],
	template: `
		<main class="not-found">
			<h1>No encontramos esta página.</h1>
			<p><a routerLink="/">Ir al mapa</a></p>
		</main>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {
	constructor() {
		const router = inject(Router);
		const path = (router.currentNavigation()?.finalUrl?.toString() ?? router.url).split('?')[0];
		inject(Seo).set(
			'Página no encontrada | fuel-insights',
			'No encontramos esta página. Vuelve al mapa de gasolineras y puntos de recarga.',
			path,
			true,
		);
	}
}
