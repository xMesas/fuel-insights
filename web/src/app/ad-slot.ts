import { ChangeDetectionStrategy, Component, inject, InjectionToken, input } from '@angular/core';
import { Account } from './account';

/** The AdSense publisher id (`ca-pub-…`). Null until AdSense approves the site: then no slot shows at all. */
export const ADS_CLIENT = new InjectionToken<string | null>('ADS_CLIENT', {
	providedIn: 'root',
	factory: () => null,
});

/**
 * A place for one ad, with its size reserved before the ad loads so the page never jumps (layout shift). Only on
 * content pages, between sections, at most two per page; never on the map, inside a board or over a chart.
 */
@Component({
	selector: 'app-ad-slot',
	template: `
		@if (client && !account?.account()?.premium) {
			<aside class="ad" [class.leaderboard]="format() === 'leaderboard'" aria-label="Publicidad">
				<span class="label">Publicidad</span>
			</aside>
		}
	`,
	styles: `
		.ad {
			display: grid;
			place-items: center;
			margin: var(--space-lg) auto;
			width: 300px;
			min-height: 250px;
			background: var(--surface);
			border-radius: 8px;
		}
		.leaderboard {
			width: min(728px, 100%);
			min-height: 90px;
		}
		.label {
			color: var(--ink-2);
			font-size: 12px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdSlot {
	readonly format = input<'rectangle' | 'leaderboard'>('rectangle');
	protected readonly client = inject(ADS_CLIENT);
	protected readonly account = this.client ? inject(Account) : null;
}
