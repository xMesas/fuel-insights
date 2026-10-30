import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	inject,
	input,
	signal,
} from '@angular/core';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import * as echarts from 'echarts/core';
import { LineChart, LineSeriesOption } from 'echarts/charts';
import {
	DataZoomComponent,
	DataZoomComponentOption,
	GridComponent,
	GridComponentOption,
	LegendComponent,
	LegendComponentOption,
	TooltipComponent,
	TooltipComponentOption,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { effectiveDate, price } from './price-format';
import { PriceTrend } from './price-models';

echarts.use([
	LineChart,
	DataZoomComponent,
	GridComponent,
	LegendComponent,
	TooltipComponent,
	SVGRenderer,
]);
type ChartOption = echarts.ComposeOption<
	| LineSeriesOption
	| DataZoomComponentOption
	| GridComponentOption
	| LegendComponentOption
	| TooltipComponentOption
>;
const DAY = 86_400_000;

/** Indexes of values that have no neighbour with data on either side, so a line cannot show them. */
export function isolatedPoints(values: (number | null)[]): Set<number> {
	const isolated = new Set<number>();
	values.forEach((value, index) => {
		if (value !== null && values[index - 1] == null && values[index + 1] == null) {
			isolated.add(index);
		}
	});
	return isolated;
}

@Component({
	selector: 'app-trend-chart',
	imports: [NgxEchartsDirective],
	providers: [provideEchartsCore({ echarts })],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<p class="help" id="trend-help">
			Usa ← / → para explorar los días o consulta la tabla. Arrastra el control para cambiar el
			periodo.
		</p>
		<div
			echarts
			[options]="options()"
			[initOpts]="{ renderer: 'svg' }"
			class="trend-chart"
			tabindex="0"
			role="group"
			aria-label="Precios medios diarios y de 7 días"
			aria-describedby="trend-help"
			(chartInit)="chart = $event"
			(focus)="focusPoint(trend().points.length - 1)"
			(blur)="clearFocus()"
			(keydown)="navigate($event)"
		></div>
		<p class="detail" role="status">{{ focusedDetail() }}</p>
	`,
	styles: `
		:host {
			display: block;
			min-width: 0;
		}
		.trend-chart {
			height: 340px;
		}
		.help,
		.detail {
			font-size: 14px;
			color: var(--ink-2);
			margin: var(--space-md) 0 0;
		}
		.detail {
			min-height: 42px;
			margin: 0;
		}
	`,
})
export class TrendChart {
	private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
	readonly trend = input.required<PriceTrend>();
	private readonly mediaVersion = signal(0);
	private readonly focusedIndex = signal<number | null>(null);
	chart?: echarts.ECharts;
	readonly focusedDetail = computed(() => {
		const index = this.focusedIndex();
		const point = index === null ? undefined : this.trend().points[index];
		return point
			? `${effectiveDate(point.date)}. Media de 7 días: ${price(point.movingAverage7, this.trend().fuel.unit)}. Media diaria: ${price(point.averagePrice, this.trend().fuel.unit)}. Mediana: ${price(point.medianPrice, this.trend().fuel.unit)}. ${point.stations.toLocaleString('es-ES', { useGrouping: 'always' })} gasolineras`
			: '';
	});
	readonly options = computed<ChartOption>(() => {
		if (!this.browser) return {};
		this.mediaVersion();
		const trend = this.trend();
		const css = getComputedStyle(document.documentElement);
		const token = (name: string) => css.getPropertyValue(name).trim();
		const end = Date.parse(trend.to);
		const start = Math.max(Date.parse(trend.from), end - 89 * DAY);
		const isolatedDays = isolatedPoints(trend.points.map((point) => point.averagePrice));
		return {
			useUTC: true,
			animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
			textStyle: { fontFamily: 'Fira Sans', color: token('--ink-2') },
			grid: { left: 52, right: 22, top: 48, bottom: 86 },
			legend: {
				top: 8,
				data: ['Media de 7 días', 'Media diaria'],
				textStyle: { color: token('--ink-2') },
			},
			xAxis: {
				type: 'time',
				min: Date.parse(trend.from),
				max: end,
				splitNumber: 3,
				axisLabel: {
					color: token('--ink-2'),
					hideOverlap: true,
					formatter: (value: number) => effectiveDate(new Date(value).toISOString().slice(0, 10)),
				},
				axisLine: { lineStyle: { color: token('--axis') } },
				axisTick: { show: false },
				splitLine: { show: false },
			},
			yAxis: {
				type: 'value',
				scale: true,
				splitNumber: 3,
				axisLabel: {
					color: token('--ink-2'),
					formatter: (value: number) => value.toFixed(3).replace('.', ','),
				},
				axisLine: { lineStyle: { color: token('--axis') } },
				splitLine: { lineStyle: { color: token('--grid') } },
			},
			dataZoom: [
				{ type: 'inside', startValue: start, endValue: end, filterMode: 'weakFilter' },
				{
					type: 'slider',
					startValue: start,
					endValue: end,
					filterMode: 'weakFilter',
					bottom: 12,
					height: 24,
					borderColor: token('--axis'),
					backgroundColor: token('--surface'),
					fillerColor: token('--data-soft'),
					dataBackground: {
						lineStyle: { color: token('--axis') },
						areaStyle: { color: token('--grid') },
					},
				},
			],
			tooltip: {
				trigger: 'axis',
				axisPointer: {
					type: 'cross',
					lineStyle: { color: token('--ink-2') },
					label: { backgroundColor: token('--ink-2'), color: token('--surface') },
				},
				renderMode: 'html',
				confine: true,
				extraCssText: 'box-shadow: none;',
				backgroundColor: token('--surface'),
				borderColor: token('--axis'),
				textStyle: { color: token('--ink') },
				formatter: (params) => {
					const item = Array.isArray(params) ? params[0] : params;
					const point = trend.points[item.dataIndex];
					const content = document.createElement('div');
					if (point) {
						const lines = [
							effectiveDate(point.date),
							`Media de 7 días: ${price(point.movingAverage7, this.trend().fuel.unit)}`,
							`Media diaria: ${price(point.averagePrice, this.trend().fuel.unit)}`,
							`Mediana: ${price(point.medianPrice, this.trend().fuel.unit)}`,
							`${point.stations.toLocaleString('es-ES', { useGrouping: 'always' })} gasolineras`,
						];
						lines.forEach((text, index) => {
							const line = document.createElement(index === 1 ? 'strong' : 'div');
							line.textContent = text;
							content.append(line);
						});
					}
					return content;
				},
			},
			series: [
				{
					type: 'line',
					name: 'Media de 7 días',
					showSymbol: false,
					connectNulls: false,
					lineStyle: { width: 2, color: token('--data') },
					itemStyle: { color: token('--data') },
					endLabel: {
						show: true,
						formatter: 'Media de 7 días',
						color: token('--ink'),
						align: 'right',
						offset: [-8, -12],
					},
					data: trend.points.map((point) => [Date.parse(point.date), point.movingAverage7]),
				},
				{
					type: 'line',
					name: 'Media diaria',
					// A day with data between two gaps has no segment to draw: give only those days a marker.
					showSymbol: true,
					symbol: 'circle',
					symbolSize: (_value: unknown, params: { dataIndex: number }) =>
						isolatedDays.has(params.dataIndex) ? 8 : 0,
					connectNulls: false,
					lineStyle: { width: 1, color: token('--data-soft') },
					itemStyle: { color: token('--data-soft') },
					data: trend.points.map((point) => [Date.parse(point.date), point.averagePrice]),
				},
			],
		};
	});

	constructor() {
		const destroyRef = inject(DestroyRef);
		if (!this.browser) return;
		for (const query of ['(prefers-color-scheme: dark)', '(prefers-reduced-motion: reduce)']) {
			const media = matchMedia(query);
			const update = () => this.mediaVersion.update((value) => value + 1);
			media.addEventListener('change', update);
			destroyRef.onDestroy(() => media.removeEventListener('change', update));
		}
	}

	focusPoint(index: number): void {
		this.focusedIndex.set(index);
		const timestamp = Date.parse(this.trend().points[index].date);
		this.chart?.dispatchAction({
			type: 'dataZoom',
			startValue: Math.max(Date.parse(this.trend().from), timestamp - 89 * DAY),
			endValue: timestamp,
		});
		this.chart?.dispatchAction({ type: 'showTip', seriesIndex: 1, dataIndex: index });
	}

	clearFocus(): void {
		this.focusedIndex.set(null);
		this.chart?.dispatchAction({ type: 'hideTip' });
	}

	navigate(event: KeyboardEvent): void {
		const last = this.trend().points.length - 1;
		const index = this.focusedIndex() ?? last;
		const next: Record<string, number> = {
			ArrowLeft: Math.max(0, index - 1),
			ArrowRight: Math.min(last, index + 1),
			Home: 0,
			End: last,
		};
		if (event.key in next) {
			event.preventDefault();
			this.focusPoint(next[event.key]);
		} else if (event.key === 'Escape') this.clearFocus();
	}
}
