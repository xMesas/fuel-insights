import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, RESPONSE_INIT, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Seo, SITE_ORIGIN } from '../seo';
import { decimal, effectiveDate, time } from '../price-format';

export const ministryDate = (value: string) =>
	`Precios del Ministerio del ${effectiveDate(value)}, ${time(value)}`;
export const fullDate = (value: string) =>
	new Intl.DateTimeFormat('es-ES', {
		timeZone: 'Europe/Madrid',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	}).format(new Date(value));
export function comparison(value: number, reference: number, area: string): string {
	const difference = value - reference;
	return Math.abs(difference) < 0.0005
		? `Igual que la media de ${area}`
		: `${decimal(Math.abs(difference) * 100, 1)} céntimos ${difference < 0 ? 'menos' : 'más'} que la media de ${area}`;
}
export function stationId(value: string): number | null {
	const match = /^(\d+)(?:-|$)/.exec(value);
	const id = match ? Number(match[1]) : NaN;
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}
export function jsonLd(value: unknown): string {
	return JSON.stringify(value).replace(/</g, '\\u003c');
}

// Scoped to each page so navigation removes its structured data.
@Injectable()
export class PageTools {
	private readonly document = inject(DOCUMENT);
	private readonly response = inject(RESPONSE_INIT, { optional: true });
	private readonly seo = inject(Seo);
	readonly origin = inject(SITE_ORIGIN);
	private script = this.document.querySelector<HTMLScriptElement>('#page-jsonld');
	constructor() {
		inject(DestroyRef).onDestroy(() => this.clear());
	}
	clear(): void {
		this.script?.remove();
		this.script = null;
	}
	structured(value: unknown): void {
		this.clear();
		this.script = this.document.createElement('script');
		this.script.type = 'application/ld+json';
		this.script.id = 'page-jsonld';
		this.script.textContent = jsonLd(value);
		this.document.head.appendChild(this.script);
	}
	breadcrumbs(items: { name: string; path: string }[]): object {
		return {
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: [{ name: 'Inicio', path: '/' }, ...items].map((item, index) => ({
				'@type': 'ListItem',
				position: index + 1,
				name: item.name,
				item: new URL(item.path, this.origin).href,
			})),
		};
	}
	error(error: unknown, path: string): 'missing' | 'error' {
		this.clear();
		const missing = error instanceof HttpErrorResponse && error.status === 404;
		if (this.response) this.response.status = missing ? 404 : 503;
		this.seo.set(
			missing ? 'Página no encontrada | fuel-insights' : 'Precios no disponibles | fuel-insights',
			missing
				? 'No encontramos esta página.'
				: 'No se han podido cargar los precios del Ministerio.',
			path,
			true,
		);
		return missing ? 'missing' : 'error';
	}
}
