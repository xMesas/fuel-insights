import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { PricesApi } from './prices-api';
import { Area, CurrentStats, Fuel, PriceTrend, ProvinceStats } from './price-models';
import {
	count,
	decimal,
	effectiveDate,
	freshness,
	importedDate,
	price,
	splitLowTax,
	weekChange,
} from './price-format';
import { FuelPicker } from './fuel-picker';
import { FuelPreference } from './fuel-preference';
import { TrendChart } from './trend-chart';
import { ProvinceChart } from './province-chart';
import { StatisticsCharts } from './statistics-charts';
import { Seo, STATS_DESCRIPTION, STATS_TITLE } from './seo';
type Status = 'loading' | 'ready' | 'empty' | 'error';
@Component({
	selector: 'app-stats-page',
	imports: [FuelPicker, TrendChart, ProvinceChart, StatisticsCharts],
	templateUrl: './stats-page.html',
	styleUrl: './stats-page.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsPage {
	private readonly api = inject(PricesApi);
	private readonly preference = inject(FuelPreference);
	private readonly trendAttempt = signal(0);
	private readonly attempt = signal(0);
	readonly selectedFuel = this.preference.fuel;
	readonly selectedArea = signal('ES');
	readonly areas = signal<Area[]>([]);
	readonly fuels = signal<Fuel[]>([]);
	readonly areaName = computed(
		() => this.areas().find((area) => area.id === this.selectedArea())?.name ?? 'España',
	);
	readonly current = signal<CurrentStats | null>(null);
	readonly currentFuel = computed(() =>
		this.current()?.fuels.find((row) => row.fuel.code === this.selectedFuel()),
	);
	readonly trend = signal<PriceTrend | null>(null);
	readonly trendStatus = signal<Status>('loading');
	readonly trendRows = computed(() => [...(this.trend()?.points ?? [])].reverse());
	readonly dayTrend = computed(() =>
		this.trendStatus() === 'ready' &&
		this.trend()?.fuel.code === this.selectedFuel() &&
		this.trend()?.area.id === this.selectedArea()
			? this.trend()
			: null,
	);
	readonly weeklyText = computed(() => {
		const fuel = this.currentFuel();
		const current =
			this.selectedArea() === 'ES'
				? fuel?.averagePrice
				: fuel?.provinces.find((row) => row.provinceId === this.selectedArea())?.averagePrice;
		const delta = weekChange(this.dayTrend(), current ?? null, this.current()?.updatedAt ?? '');
		if (!delta) return '';
		return delta.change === 0
			? 'Igual que hace 7 días.'
			: `${delta.change > 0 ? 'Sube' : 'Baja'} ${decimal(Math.abs(delta.change) * 100, 1)} céntimos en 7 días.`;
	});
	readonly periodMaximum = computed(() => {
		if (this.selectedArea() === 'ES') return this.currentFuel()?.maxDaily ?? null;
		const points = this.dayTrend()?.points.filter((row) => row.averagePrice !== null) ?? [];
		return points.toSorted((a, b) => b.averagePrice! - a.averagePrice!)[0] ?? null;
	});
	readonly showTrendTable = signal(false);
	private readonly rawStats = signal<ProvinceStats | null>(null);
	readonly stats = computed(() => {
		const stats = this.rawStats();
		return stats
			? {
					...stats,
					provinces: stats.provinces.map((row) => ({
						...row,
						province: this.areas().find((area) => area.id === row.provinceId)?.name ?? row.province,
					})),
				}
			: null;
	});
	readonly status = signal<Status | 'no-prices'>('loading');
	readonly showTable = signal(false);
	readonly provinceGroups = computed(() => {
		const stats = this.stats();
		if (!stats) return [];
		const groups = splitLowTax(stats.provinces);
		return [
			{ title: 'Península y Baleares', stats: { ...stats, provinces: groups.peninsula } },
			{ title: 'Canarias, Ceuta y Melilla', stats: { ...stats, provinces: groups.lowTax } },
		];
	});
	readonly price = price;
	readonly effectiveDate = effectiveDate;
	readonly importedDate = importedDate;
	readonly count = count;
	constructor() {
		inject(Seo).set(STATS_TITLE, STATS_DESCRIPTION, '/estadisticas');
		inject(HttpClient)
			.get<Area[]>('/api/pages/provinces')
			.pipe(
				catchError(() => of([])),
				takeUntilDestroyed(),
			)
			.subscribe((areas) => this.areas.set(areas));
		this.api
			.getFuels()
			.pipe(
				catchError(() => of([])),
				takeUntilDestroyed(),
			)
			.subscribe((fuels) => this.fuels.set(fuels));
		this.api
			.getCurrent()
			.pipe(
				catchError(() => of(null)),
				takeUntilDestroyed(),
			)
			.subscribe((current) => this.current.set(current));
		toObservable(
			computed(() => ({
				fuel: this.selectedFuel(),
				area: this.selectedArea(),
				attempt: this.trendAttempt(),
			})),
		)
			.pipe(
				tap(() => this.trendStatus.set('loading')),
				switchMap(({ fuel, area }) =>
					this.api.getTrend(fuel, area).pipe(
						map((trend) => ({ trend, failed: false })),
						catchError(() => of({ trend: null, failed: true })),
					),
				),
				takeUntilDestroyed(),
			)
			.subscribe(({ trend, failed }) => {
				if (failed) {
					this.trendStatus.set('error');
					return;
				}
				this.trend.set(trend);
				this.trendStatus.set(
					trend?.points.some((point) => point.averagePrice !== null) ? 'ready' : 'empty',
				);
			});
		toObservable(computed(() => ({ fuel: this.selectedFuel(), attempt: this.attempt() })))
			.pipe(
				tap(() => this.status.set('loading')),
				switchMap(({ fuel }) =>
					this.api.getProvinces(fuel).pipe(
						map((stats) => ({ stats, failed: false })),
						catchError(() => of({ stats: null, failed: true })),
					),
				),
				takeUntilDestroyed(),
			)
			.subscribe(({ stats, failed }) => {
				if (failed) {
					this.status.set('error');
					return;
				}
				this.rawStats.set(stats);
				this.status.set(!stats ? 'empty' : stats.provinces.length ? 'ready' : 'no-prices');
			});
	}

	chooseFuel(code: string): void {
		this.preference.choose(code);
	}
	retry(): void {
		this.attempt.update((value) => value + 1);
	}
	retryTrend(): void {
		this.trendAttempt.update((value) => value + 1);
	}
}
