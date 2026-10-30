import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import {
	afterNextRender,
	afterRenderEffect,
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	ElementRef,
	inject,
	input,
	output,
	signal,
	viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { decimal } from './price-format';
import { ChargingSite } from './price-models';
import { PRICE_CLOCK } from './price-clock';
import {
	appleDirections,
	googleDirections,
	CHARGING_PARAM,
	siteLink,
	openLabel,
	openState,
	wazeDirections,
} from './station-functions';
import { bandOf, chargingFreshness, POWER_BANDS, powerText } from './charging-functions';

/**
 * The card of a public charging site. It answers what a driver of an electric car asks first: how fast, which
 * connectors, open or not, and how to get there. The feed has no prices, and the card says so.
 */
@Component({
	selector: 'app-charging-card',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { '(document:keydown.escape)': 'escape($event)', '(document:click)': 'outside($event)' },
	styleUrl: './station-card.css',
	template: `
		<section aria-labelledby="charging-title" role="region" #card>
			<div class="top">
				@if (site(); as data) {
					@if (data.maxPowerKw !== null) {
						<p class="rank">
							<span class="pill">{{ bandName(data.maxPowerKw) }}</span>
						</p>
					}
				}
				<span class="tools">
					<button class="icon" (click)="close.emit()" aria-label="Cerrar punto de recarga">
						×
					</button>
				</span>
			</div>
			@if (site(); as data) {
				<h2 id="charging-title" tabindex="-1">{{ data.operator ?? 'Punto de recarga' }}</h2>
				@if (data.name) {
					<p class="note">{{ data.name }}</p>
				}
				<p class="note">{{ data.town }}</p>
				@if (distance() !== null) {
					<p class="note">{{ decimal(distance()!, 1) }} km</p>
				}
				<p [class.note]="state().kind === 'closed'">
					@if (state().kind === 'closed') {
						<svg class="clock" viewBox="0 0 24 24" aria-hidden="true">
							<circle cx="12" cy="12" r="9" />
							<path d="M12 6v6l4 2" />
						</svg>
					}
					{{ label() }}
				</p>
				@if (data.maxPowerKw !== null) {
					<p class="selected-price">{{ powerText(data.maxPowerKw) }}</p>
					<p class="note">
						Potencia máxima · {{ data.points }}
						{{ data.points === 1 ? 'punto de carga' : 'puntos de carga' }}
					</p>
				}
				@if (data.connectors.length) {
					<dl>
						@for (connector of data.connectors; track $index) {
							<div>
								<dt>{{ connector.type }} · {{ connector.current }}</dt>
								<dd>{{ connector.count }} × {{ powerText(connector.powerKw) }}</dd>
							</div>
						}
					</dl>
				}
				@if (data.payment.length) {
					<p>Pago: {{ data.payment.join(', ') }}.</p>
				}
				<p class="note">
					Sin precio ni disponibilidad en tiempo real: el Ministerio no los publica.
				</p>
				<p class="note">{{ address() }}</p>
				<p class="note">{{ freshness(data.updatedAt) }}</p>
				<p class="note coordinates">
					{{ decimal(data.latitude, 5) }}, {{ decimal(data.longitude, 5) }}
				</p>
				<div class="actions">
					<div class="directions" #disclosure>
						<button
							class="primary"
							#directionsButton
							[attr.aria-expanded]="menuOpen()"
							aria-controls="charging-directions"
							(click)="menuOpen.set(!menuOpen())"
						>
							Cómo llegar
						</button>
						@if (menuOpen()) {
							<ul id="charging-directions" aria-label="Elige una aplicación">
								@for (link of links(); track link.name) {
									<li>
										<a [href]="link.url" target="_blank" rel="noopener"
											>{{ link.name
											}}<span class="visually-hidden"> (se abre en otra pestaña)</span></a
										>
									</li>
								}
							</ul>
						}
					</div>
					<button (click)="share()">Compartir</button>
					<p role="status" aria-live="polite" class="note share-status">{{ shareStatus() }}</p>
				</div>
			} @else if (error()) {
				<h2 id="charging-title" tabindex="-1">No se pudo cargar el punto de recarga.</h2>
				<button (click)="retry.emit()">Reintentar</button>
			} @else {
				<h2 id="charging-title" tabindex="-1" role="status">Cargando punto de recarga…</h2>
			}
		</section>
	`,
})
export class ChargingCard {
	private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
	readonly site = input<ChargingSite | null>(null);
	readonly error = input(false);
	readonly distance = input<number | null>(null);
	readonly close = output<void>();
	readonly retry = output<void>();
	readonly resized = output<{ width: number; height: number }>();
	readonly card = viewChild.required<ElementRef<HTMLElement>>('card');
	readonly disclosure = viewChild<ElementRef<HTMLElement>>('disclosure');
	readonly directionsButton = viewChild<ElementRef<HTMLButtonElement>>('directionsButton');
	readonly decimal = decimal;
	readonly powerText = powerText;
	readonly freshness = chargingFreshness;
	private readonly host = inject(ElementRef<HTMLElement>);
	private readonly clock = inject(PRICE_CLOCK);
	private readonly destroyRef = inject(DestroyRef);
	readonly now = signal(this.clock.now());
	readonly state = computed(() => openState(this.site()?.openingHours, new Date(this.now())));
	// Half of the sites publish no hours; most public chargers never close, but that is not ours to say.
	readonly label = computed(() =>
		this.site()?.schedule
			? openLabel(this.state(), this.site()!.schedule!)
			: 'Horario no publicado',
	);
	readonly address = computed(() => {
		const site = this.site();
		return site
			? [site.address, [site.postalCode, site.town].filter(Boolean).join(' '), site.province]
					.filter(Boolean)
					.join(', ')
			: '';
	});
	readonly menuOpen = signal(false);
	readonly shareStatus = signal('');
	readonly links = computed(() => {
		const site = this.site();
		const name = site?.operator ?? 'Punto de recarga';
		return site
			? [
					{ name: 'Google Maps', url: googleDirections(site) },
					{ name: 'Waze', url: wazeDirections(site) },
					{ name: 'Apple Maps', url: appleDirections(site, name) },
				]
			: [];
	});
	private timer?: ReturnType<typeof setTimeout>;

	constructor() {
		if (this.browser)
			interval(60_000)
				.pipe(takeUntilDestroyed())
				.subscribe(() => this.now.set(this.clock.now()));
		afterNextRender(() => {
			if (typeof ResizeObserver === 'undefined') return;
			const observer = new ResizeObserver(() => {
				const rect = this.host.nativeElement.getBoundingClientRect();
				this.resized.emit({ width: rect.width, height: rect.height });
			});
			observer.observe(this.host.nativeElement);
			this.destroyRef.onDestroy(() => observer.disconnect());
		});
		let focusedId: string | null | undefined;
		afterRenderEffect(() => {
			const id = this.site()?.id ?? null;
			if (id !== focusedId || this.error()) {
				this.card().nativeElement.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
				focusedId = id;
				this.menuOpen.set(false);
			}
		});
		this.destroyRef.onDestroy(() => clearTimeout(this.timer));
	}

	bandName(powerKw: number): string {
		return POWER_BANDS[bandOf(powerKw)].name;
	}

	escape(event: Event): void {
		const target = event.target as HTMLElement | null;
		if (
			target &&
			!this.host.nativeElement.contains(target) &&
			target.closest?.('input, select, textarea, [role="combobox"]')
		)
			return;
		if (this.menuOpen()) {
			event.stopPropagation();
			this.menuOpen.set(false);
			this.directionsButton()?.nativeElement.focus();
		} else this.close.emit();
	}

	outside(event: Event): void {
		if (!this.disclosure()?.nativeElement.contains(event.target as Node)) this.menuOpen.set(false);
	}

	async share(): Promise<void> {
		if (!this.browser) return;
		const site = this.site();
		if (!site) return;
		const name = site.operator ?? 'Punto de recarga';
		const power = site.maxPowerKw !== null ? `, hasta ${powerText(site.maxPowerKw)}` : '';
		const text = `${name} en ${site.town ?? 'España'}${power}.`;
		const url = siteLink(CHARGING_PARAM, site.id);
		try {
			if (navigator.share) await navigator.share({ title: name, text, url });
			else {
				await navigator.clipboard.writeText(`${text}\n${url}`);
				if (this.destroyRef.destroyed) return;
				this.shareStatus.set('Copiado');
				clearTimeout(this.timer);
				this.timer = setTimeout(() => this.shareStatus.set(''), 2000);
			}
		} catch (error) {
			const cancelled =
				typeof error === 'object' &&
				error !== null &&
				'name' in error &&
				error.name === 'AbortError';
			if (!this.destroyRef.destroyed && !cancelled)
				this.shareStatus.set('No se pudo compartir. Vuelve a intentarlo.');
		}
	}
}
