import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, InjectionToken, PLATFORM_ID } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export const SITE_ORIGIN = new InjectionToken<string>('SITE_ORIGIN', {
	providedIn: 'root',
	factory: () =>
		isPlatformBrowser(inject(PLATFORM_ID))
			? inject(DOCUMENT).location.origin
			: 'http://localhost:4000',
});

export const MAP_TITLE = 'Precio de la gasolina y el diésel: mapa de gasolineras | fuel-insights';
export const MAP_DESCRIPTION =
	'Las gasolineras más baratas de lo que ves en el mapa, con el precio oficial del Ministerio. También puntos de recarga eléctrica por potencia, en toda España.';
export const STATS_TITLE =
	'Estadísticas del precio de la gasolina y el diésel en España | fuel-insights';
export const STATS_DESCRIPTION =
	'Evolución del precio de la gasolina y el diésel en España y por provincia, con medias diarias y de siete días del Ministerio.';

@Injectable({ providedIn: 'root' })
export class Seo {
	private readonly title = inject(Title);
	private readonly meta = inject(Meta);
	private readonly document = inject(DOCUMENT);
	private readonly origin = inject(SITE_ORIGIN);

	set(title: string, description: string, path: string, noindex = false): void {
		const url = new URL(path, this.origin).href;
		this.title.setTitle(title);
		this.meta.updateTag({ name: 'description', content: description });
		this.meta.updateTag({ property: 'og:title', content: title });
		this.meta.updateTag({ property: 'og:description', content: description });
		this.meta.updateTag({ property: 'og:url', content: url });
		if (noindex) this.meta.updateTag({ name: 'robots', content: 'noindex' });
		else this.meta.removeTag('name="robots"');
		let canonical = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
		if (!canonical) {
			canonical = this.document.createElement('link');
			canonical.rel = 'canonical';
			this.document.head.appendChild(canonical);
		}
		canonical.href = url;
	}
}
