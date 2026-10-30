import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * The letters a 14-segment LED panel can draw: capitals without accents. "Ubicación" becomes "UBICACION" on the
 * panel; screen readers get the real text.
 */
export function ledText(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toUpperCase()
		.replace(/[^A-Z0-9 .,:\-!?]/g, ' ');
}

/**
 * A short notice in the style of a petrol station's LED sign: amber letters gliding along a translucent strip at
 * the top of the screen. It covers nothing important, closes with a tap, and leaves by itself.
 */
@Component({
	selector: 'app-led-notice',
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		@if (message(); as text) {
			<div class="notice" role="status">
				<span class="visually-hidden">{{ text }}</span>
				<div class="window" aria-hidden="true">
					<div class="track" [style.animation-duration.s]="duration()">
						<span>{{ led() }}</span>
						<span>{{ led() }}</span>
					</div>
				</div>
				<button type="button" aria-label="Cerrar aviso" (click)="dismissed.emit()">×</button>
			</div>
		}
	`,
	styles: `
		:host {
			position: fixed;
			z-index: 20;
			top: 12px;
			left: 50%;
			width: min(560px, calc(100% - 32px));
			transform: translateX(-50%);
			pointer-events: none;
		}
		.notice {
			display: flex;
			align-items: center;
			gap: 4px;
			padding-left: 14px;
			border: 1px solid rgba(255, 178, 36, 0.35);
			border-radius: 999px;
			background: rgba(12, 12, 12, 0.72);
			backdrop-filter: blur(6px);
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
		}
		.window {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
		}
		.track {
			display: flex;
			width: max-content;
			animation: glide linear infinite;
		}
		.track span {
			padding-right: 64px;
			font:
				400 15px/44px DSEG14,
				monospace;
			letter-spacing: 1px;
			color: var(--led);
			text-shadow: 0 0 6px rgba(255, 178, 36, 0.55);
			white-space: nowrap;
		}
		/* Two copies side by side: moving by half the track loops without a jump. */
		@keyframes glide {
			from {
				transform: translateX(0);
			}
			to {
				transform: translateX(-50%);
			}
		}
		button {
			flex: none;
			min-width: 44px;
			min-height: 44px;
			padding: 0;
			border: 0;
			border-radius: 999px;
			background: transparent;
			color: var(--panel-ink);
			font-size: 20px;
			pointer-events: auto;
		}
		button:focus-visible {
			outline: 2px solid var(--panel-ink);
			outline-offset: -4px;
		}
		@media (prefers-reduced-motion: reduce) {
			.track {
				animation: none;
			}
			.track span + span {
				display: none;
			}
			.track span {
				white-space: normal;
				line-height: 1.6;
				padding: 10px 0;
			}
		}
	`,
})
export class LedNotice {
	readonly message = input<string | null>(null);
	readonly dismissed = output<void>();
	readonly led = computed(() => ledText(this.message() ?? ''));
	// About 7 characters a second, the pace of a real sign.
	readonly duration = computed(() => Math.max(6, this.led().length / 7));
}
