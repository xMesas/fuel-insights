import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	ViewEncapsulation,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import avisoLegal from '../../../docs/legal/aviso-legal.md';
import privacidad from '../../../docs/legal/privacidad.md';
import cookies from '../../../docs/legal/cookies.md';
import { markdownToHtml } from './markdown';
import { Seo } from './seo';

// The texts live once, in docs/legal, and are built into the page: the same words in the repo and on the site.
const DOCUMENTS: Record<string, { path: string; text: string; description: string }> = {
	'aviso-legal': {
		path: '/aviso-legal',
		text: avisoLegal,
		description:
			'Quién está detrás de fuel-insights, de dónde salen los datos y en qué condiciones se usan.',
	},
	privacidad: {
		path: '/privacidad',
		text: privacidad,
		description:
			'Qué datos trata fuel-insights, para qué, durante cuánto tiempo y cómo ejercer tus derechos.',
	},
	cookies: {
		path: '/cookies',
		text: cookies,
		description: 'Qué guarda fuel-insights en tu navegador y cómo borrarlo.',
	},
};

/** The legal notice, the privacy policy and the cookie policy. The first heading of each text is the page title. */
@Component({
	selector: 'app-legal-page',
	template: `
		<main class="legal">
			<h1>{{ title() }}</h1>
			<div class="legal-text" [innerHTML]="html()"></div>
		</main>
	`,
	styles: `
		app-legal-page .legal {
			max-width: 72ch;
			margin: 0 auto;
			padding: var(--space-lg) var(--space-md);
			line-height: 1.6;
		}
		.legal-text :is(h2, h3) {
			margin-top: var(--space-xl);
		}
		.legal-text .table-scroll {
			overflow-x: auto;
		}
		.legal-text table {
			border-collapse: collapse;
			font-size: 14px;
		}
		.legal-text :is(th, td) {
			border-bottom: 1px solid var(--hairline);
			padding: var(--space-xs) var(--space-sm);
			text-align: left;
			vertical-align: top;
		}
	`,
	// The text is HTML made at build time, so its elements carry no component attribute: the styles go unscoped,
	// every selector under .legal-text.
	encapsulation: ViewEncapsulation.None,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalPage {
	private readonly document = DOCUMENTS[inject(ActivatedRoute).snapshot.data['document'] as string];
	private readonly parts = splitTitle(this.document.text);
	readonly title = computed(() => this.parts.title);
	readonly html = computed(() => markdownToHtml(this.parts.body));

	constructor() {
		inject(Seo).set(
			`${this.parts.title} | fuel-insights`,
			this.document.description,
			this.document.path,
		);
	}
}

export function splitTitle(markdown: string): { title: string; body: string } {
	const match = /^#\s+(.+)\r?\n/.exec(markdown.trimStart());
	return match
		? { title: match[1].trim(), body: markdown.trimStart().slice(match[0].length) }
		: { title: '', body: markdown };
}
