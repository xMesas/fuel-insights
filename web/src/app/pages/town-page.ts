import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { PricesApi } from '../prices-api';
import { Fuel } from '../price-models';
import { TownPageData, TownStation } from './page-models';
import { PageTools, comparison, ministryDate } from './page-tools';
import { price } from '../price-format';
import { Seo } from '../seo';
import { AdSlot } from '../ad-slot';
import { FuelPicker } from '../fuel-picker';
import { FuelPreference } from '../fuel-preference';
import { openLabel, openState } from '../station-functions';
import { PRICE_CLOCK } from '../price-clock';

@Component({
	selector: 'app-town-page',
	imports: [FuelPicker, RouterLink, AdSlot],
	providers: [PageTools],
	templateUrl: './town-page.html',
	styleUrl: './pages.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TownPage {
	private readonly http = inject(HttpClient);
	private readonly tools = inject(PageTools);
	private readonly seo = inject(Seo);
	private readonly now = new Date(inject(PRICE_CLOCK).now());
	readonly preference = inject(FuelPreference);
	readonly pickerFuels = signal<Fuel[]>([]);
	readonly data = signal<TownPageData | null>(null);
	readonly status = signal('loading');
	readonly ascending = signal(true);
	readonly selected = computed(() =>
		this.data()?.fuels.find((row) => row.fuel.code === this.preference.fuel()),
	);
	readonly stations = computed(() => {
		const code = this.selected()?.fuel.code;
		return [...(this.data()?.stations ?? [])].sort((a, b) => {
			const left = code ? a.prices[code] : undefined,
				right = code ? b.prices[code] : undefined;
			if (left == null) return right == null ? a.id - b.id : 1;
			if (right == null) return -1;
			return (left - right) * (this.ascending() ? 1 : -1) || a.id - b.id;
		});
	});
	readonly price = price;
	readonly ministryDate = ministryDate;
	readonly comparison = comparison;
	open(station: TownStation): string {
		return openLabel(openState(station.openingHours, this.now), station.schedule);
	}
	constructor() {
		inject(PricesApi)
			.getFuels()
			.pipe(
				catchError(() => of([])),
				takeUntilDestroyed(),
			)
			.subscribe((fuels) => this.pickerFuels.set(fuels));
		inject(ActivatedRoute)
			.paramMap.pipe(
				switchMap((params) => {
					this.data.set(null);
					this.tools.clear();
					this.status.set('loading');
					const province = encodeURIComponent(params.get('province')!),
						town = encodeURIComponent(params.get('town')!);
					return this.http.get<TownPageData>(`/api/pages/provinces/${province}/${town}`).pipe(
						catchError((error) => {
							this.status.set(this.tools.error(error, `/gasolineras/${province}/${town}`));
							return of(null);
						}),
					);
				}),
				takeUntilDestroyed(),
			)
			.subscribe((page) => {
				if (!page) return;
				this.data.set(page);
				this.status.set('ready');
				const provincePath = `/gasolineras/${page.province.slug}`,
					path = `${provincePath}/${page.town.slug}`;
				const row = page.fuels[0];
				this.seo.set(
					`Gasolineras en ${page.town.name} (${page.province.name}): precios hoy | fuel-insights`,
					row
						? `${row.fuel.name} a ${price(row.averagePrice, row.fuel.unit)} de media en ${page.town.name}; la más barata, ${price(row.minPrice, row.fuel.unit)}. ${ministryDate(page.updatedAt)}.`
						: ministryDate(page.updatedAt),
					path,
				);
				this.tools.structured(
					this.tools.breadcrumbs([
						{ name: page.province.name, path: provincePath },
						{ name: page.town.name, path },
					]),
				);
			});
	}
}
