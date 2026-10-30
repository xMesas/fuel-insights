import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Area } from './price-models';
import { FuelPreference } from './fuel-preference';
import { decimal, effectiveDate, importedDate, price } from './price-format';
import { BrandStats, SpreadStats, WeekdayStats } from './statistics-models';
import {
	brandConclusion,
	spreadConclusion,
	weekdayConclusion,
	WEEKDAYS,
} from './statistics-summary';
import { StatisticsPlot, PlotRow } from './statistics-plot';
import { AdSlot } from './ad-slot';

type Kind = 'weekdays' | 'spread' | 'brands';
type Stats = WeekdayStats | SpreadStats | BrandStats;
interface ChartState {
	status: 'loading' | 'error' | 'ready';
	data: Stats | null;
}
interface StatisticsSection {
	kind: Kind;
	title: string;
	state: ReturnType<typeof signal<ChartState>>;
	retry: ReturnType<typeof signal<number>>;
}

@Component({
	selector: 'app-statistics-charts',
	imports: [StatisticsPlot, AdSlot],
	templateUrl: './statistics-charts.html',
	styleUrl: './statistics-charts.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatisticsCharts {
	private readonly http = inject(HttpClient);
	private readonly preference = inject(FuelPreference);
	readonly provinces = input<Area[]>([]);
	readonly sections: StatisticsSection[] = [
		this.section('weekdays', '¿Qué día es más barato repostar?'),
		this.section('spread', 'Cuánto ahorras eligiendo gasolinera'),
		this.section('brands', 'Precio por marca'),
	];
	readonly decimal = decimal;
	readonly price = price;
	readonly weekdayConclusion = weekdayConclusion;
	readonly spreadConclusion = spreadConclusion;
	readonly brandConclusion = brandConclusion;
	readonly effectiveDate = effectiveDate;
	readonly importedDate = importedDate;
	readonly weekdays = WEEKDAYS;
	readonly weekdayData = computed(() => this.sections[0].state().data as WeekdayStats | null);
	readonly spreadData = computed(() => this.sections[1].state().data as SpreadStats | null);
	readonly brandData = computed(() => this.sections[2].state().data as BrandStats | null);
	readonly weekdayRows = computed(() =>
		(this.weekdayData()?.weekdays ?? [])
			.filter((row) => row.days > 0)
			.toSorted((a, b) => a.weekday - b.weekday),
	);
	readonly spreadRows = computed(() =>
		(this.spreadData()?.provinces ?? []).toSorted(
			(a, b) => b.dearPrice - b.cheapPrice - (a.dearPrice - a.cheapPrice),
		),
	);
	readonly brandRows = computed(() =>
		(this.brandData()?.brands ?? []).toSorted((a, b) => a.averagePrice - b.averagePrice),
	);

	constructor() {
		for (const section of this.sections) {
			toObservable(computed(() => ({ fuel: this.preference.fuel(), retry: section.retry() })))
				.pipe(
					switchMap(({ fuel }) =>
						this.http.get<Stats>(`/api/stats/${section.kind}`, { params: { fuel } }).pipe(
							map((data): ChartState => ({ status: 'ready', data })),
							catchError(() => of<ChartState>({ status: 'error', data: null })),
							startWith<ChartState>({ status: 'loading', data: null }),
						),
					),
					takeUntilDestroyed(),
				)
				.subscribe((state) => section.state.set(state));
		}
	}

	provinceName(id: string | null): string {
		return this.provinces().find((row) => row.id === id)?.name ?? id ?? 'España';
	}

	plotRows(kind: Kind): PlotRow[] {
		if (kind === 'weekdays')
			return this.weekdayRows().map((row) => ({
				label: WEEKDAYS[row.weekday - 1],
				value: row.deviation * 100,
			}));
		if (kind === 'spread')
			return this.spreadRows().map((row) => ({
				label: this.provinceName(row.provinceId),
				value: row.cheapPrice,
				end: row.dearPrice,
			}));
		return this.brandRows().map((row) => ({ label: row.name, value: row.averagePrice }));
	}

	private section(kind: Kind, title: string): StatisticsSection {
		return {
			kind,
			title,
			state: signal<ChartState>({ status: 'loading', data: null }),
			retry: signal(0),
		};
	}
}
