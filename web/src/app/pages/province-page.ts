import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, of, switchMap, tap } from 'rxjs';
import { ProvinceFuel, ProvinceLink, ProvincePageData } from './page-models';
import { PageTools, comparison, fullDate, ministryDate } from './page-tools';
import { CheapestTable, PageFigures } from './page-parts';
import { price, effectiveDate } from '../price-format';
import { Seo } from '../seo';
import { AdSlot } from '../ad-slot';
import { FuelPicker } from '../fuel-picker';
import { FuelPreference } from '../fuel-preference';
import { PricesApi } from '../prices-api';
import { Fuel, PriceTrend } from '../price-models';
import { TrendChart } from '../trend-chart';

@Component({
	selector: 'app-province-page',
	imports: [FuelPicker, RouterLink, CheapestTable, PageFigures, TrendChart, AdSlot],
	providers: [PageTools],
	templateUrl: './province-page.html',
	styleUrl: './pages.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvincePage {
	private readonly http = inject(HttpClient);
	private readonly tools = inject(PageTools);
	private readonly seo = inject(Seo);
	private readonly api = inject(PricesApi);
	readonly preference = inject(FuelPreference);
	readonly pickerFuels = signal<Fuel[]>([]);
	readonly data = signal<ProvincePageData | null>(null);
	readonly catalogue = signal<ProvinceLink[]>([]);
	readonly status = signal('loading');
	readonly main = computed(() => this.data()?.fuels.filter((row) => row.fuel.main) ?? []);
	readonly others = computed(() => this.data()?.fuels.filter((row) => !row.fuel.main) ?? []);
	readonly selected = computed<ProvinceFuel | undefined>(() =>
		this.data()?.fuels.find((row) => row.fuel.code === this.preference.fuel()),
	);
	readonly trend = signal<PriceTrend | null>(null);
	readonly trendStatus = signal('loading');
	readonly price = price;
	readonly ministryDate = ministryDate;
	readonly comparison = comparison;
	readonly effectiveDate = effectiveDate;
	readonly fullDate = fullDate;
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
					const slug = params.get('province')!;
					return forkJoin({
						page: this.http.get<ProvincePageData>(
							`/api/pages/provinces/${encodeURIComponent(slug)}`,
						),
						catalogue: this.http.get<ProvinceLink[]>('/api/pages/provinces'),
					}).pipe(
						catchError((error) => {
							this.status.set(this.tools.error(error, `/gasolineras/${slug}`));
							return of(null);
						}),
					);
				}),
				takeUntilDestroyed(),
			)
			.subscribe((result) => {
				if (!result) return;
				const page = result.page;
				this.catalogue.set(result.catalogue);
				this.data.set(page);
				this.status.set('ready');
				const row = page.fuels.find((row) => row.fuel.main) ?? page.fuels[0];
				const path = `/gasolineras/${page.province.slug}`;
				this.seo.set(
					`Gasolineras en ${page.province.name}: precio de la gasolina y el diésel hoy | fuel-insights`,
					row
						? `${row.fuel.shortName ?? row.fuel.name} a ${price(row.figures.averagePrice, row.fuel.unit)} de media en ${page.province.name}; la más barata, ${price(row.figures.minPrice, row.fuel.unit)}. ${ministryDate(page.updatedAt)}.`
						: ministryDate(page.updatedAt),
					path,
				);
				this.tools.structured(this.tools.breadcrumbs([{ name: page.province.name, path }]));
			});
		toObservable(
			computed(() => ({ page: this.data(), row: this.selected(), catalogue: this.catalogue() })),
		)
			.pipe(
				tap(() => {
					this.trend.set(null);
					this.trendStatus.set('loading');
				}),
				switchMap(({ page, row, catalogue }) => {
					const area = catalogue.find((item) => item.slug === page?.province.slug);
					return area && row
						? this.api.getTrend(row.fuel.code, area.id).pipe(
								catchError(() => {
									this.trendStatus.set('error');
									return of(null);
								}),
							)
						: of(null);
				}),
				takeUntilDestroyed(),
			)
			.subscribe((trend) => {
				this.trend.set(trend);
				if (this.trendStatus() !== 'error')
					this.trendStatus.set(trend?.points.length ? 'ready' : 'empty');
			});
	}
}
