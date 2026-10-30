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
import { ScatterChart, ScatterSeriesOption } from 'echarts/charts';
import {
	GridComponent,
	GridComponentOption,
	MarkLineComponent,
	TooltipComponent,
	TooltipComponentOption,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { price } from './price-format';
import { ProvinceStats } from './price-models';

echarts.use([ScatterChart, GridComponent, MarkLineComponent, TooltipComponent, SVGRenderer]);
type ChartOption = echarts.ComposeOption<
	ScatterSeriesOption | GridComponentOption | TooltipComponentOption
>;

@Component({
	selector: 'app-province-chart',
	imports: [NgxEchartsDirective],
	providers: [provideEchartsCore({ echarts })],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<p [id]="helpId()" class="help">
			Usa ↑ / ↓ para explorar las provincias. Los nombres y precios también están en la tabla.
		</p>
		<div
			echarts
			[options]="options()"
			[initOpts]="{ renderer: 'svg' }"
			[style.height.px]="stats().provinces.length * 24 + 100"
			tabindex="0"
			role="group"
			aria-label="Precios por provincia, de menor a mayor"
			[attr.aria-describedby]="helpId()"
			(chartInit)="chart = $event"
			(focus)="focusPoint(0)"
			(blur)="clearFocus()"
			(keydown)="navigate($event)"
		></div>
		<p class="keyboard-detail" role="status">{{ focusedDetail() }}</p>
	`,
	styles: `
		:host {
			display: block;
			min-width: 0;
		}
		.help {
			font-size: 14px;
			color: var(--ink-2);
			margin: var(--space-md) 0 0;
		}
		.keyboard-detail {
			font-size: 14px;
			color: var(--ink-2);
			min-height: 42px;
			margin: 0;
		}
	`,
})
export class ProvinceChart {
	private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
	readonly stats = input.required<ProvinceStats>();
	readonly area = input('ES');
	readonly helpId = input('chart-help');
	private readonly mediaVersion = signal(0);
	private readonly focusedIndex = signal<number | null>(null);
	chart?: echarts.ECharts;
	readonly focusedDetail = computed(() => {
		const index = this.focusedIndex();
		const row = index === null ? undefined : this.stats().provinces[index];
		return row
			? `${price(row.averagePrice, this.stats().fuel.unit)}. ${row.province}. Mediana: ${price(row.medianPrice, this.stats().fuel.unit)}. ${price(row.minPrice, this.stats().fuel.unit)}–${price(row.maxPrice, this.stats().fuel.unit)}. ${row.stations} gasolineras`
			: '';
	});
	readonly options = computed<ChartOption>(() => {
		if (!this.browser) return {};
		this.mediaVersion();
		const css = getComputedStyle(document.documentElement);
		const token = (name: string) => css.getPropertyValue(name).trim();
		const stats = this.stats();
		const national = stats.national.averagePrice;
		const values = [
			...stats.provinces.map((row) => row.averagePrice),
			...(national === null ? [] : [national]),
		];
		const min = Math.min(...values);
		const max = Math.max(...values);
		const padding = Math.max((max - min) * 0.15, 0.03);
		return {
			animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
			textStyle: { fontFamily: 'Fira Sans', color: token('--ink-2') },
			grid: { left: 130, right: 46, top: 44, bottom: 48 },
			xAxis: {
				type: 'value',
				// Round the ends to 0.1 so the end labels fall on round values and do not crowd the ticks.
				min: Math.max(0.1, Math.floor((min - padding) * 10) / 10),
				max: Math.ceil((max + padding) * 10) / 10,
				splitNumber: 3,
				position: 'top',
				axisLabel: {
					color: token('--ink-2'),
					formatter: (value: number) => value.toFixed(2).replace('.', ','),
				},
				axisLine: { show: true, lineStyle: { color: token('--axis') } },
				splitLine: { lineStyle: { color: token('--grid') } },
			},
			yAxis: {
				type: 'category',
				inverse: true,
				data: stats.provinces.map((row) => ({
					value: row.province,
					textStyle: { fontWeight: row.provinceId === this.area() ? 'bold' : 'normal' },
				})),
				axisTick: { show: false },
				axisLine: { lineStyle: { color: token('--axis') } },
				axisLabel: {
					interval: 0,
					width: 116,
					overflow: 'truncate',
					color: token('--ink-2'),
					fontSize: 12,
				},
			},
			tooltip: {
				trigger: 'item',
				renderMode: 'html',
				confine: true,
				extraCssText: 'box-shadow: none;',
				backgroundColor: token('--surface'),
				borderColor: token('--axis'),
				textStyle: { color: token('--ink') },
				formatter: (params) => {
					const point = Array.isArray(params) ? params[0] : params;
					const row = stats.provinces[point.dataIndex];
					const content = document.createElement('div');
					if (row) {
						const heading = document.createElement('strong');
						heading.textContent = price(row.averagePrice, this.stats().fuel.unit);
						content.append(heading);
						for (const text of [
							row.province,
							`Mediana: ${price(row.medianPrice, this.stats().fuel.unit)}`,
							`Mínimo–máximo: ${price(row.minPrice, this.stats().fuel.unit)}–${price(row.maxPrice, this.stats().fuel.unit)}`,
							`${row.stations.toLocaleString('es-ES', { useGrouping: 'always' })} gasolineras`,
						]) {
							const line = document.createElement('div');
							line.textContent = text;
							content.append(line);
						}
					}
					return content;
				},
			},
			series: [
				{
					type: 'scatter',
					symbolSize: 8,
					itemStyle: { color: token('--data'), opacity: 1 },
					data: stats.provinces.map((row, index) => ({
						value: [row.averagePrice, index],
						itemStyle: {
							color: token(
								this.area() === 'ES' || row.provinceId === this.area() ? '--data' : '--data-soft',
							),
						},
						label: {
							show: index === 0 || index === stats.provinces.length - 1,
							position: index === 0 ? 'right' : 'left',
							color: token('--ink'),
							formatter: row.averagePrice.toFixed(3).replace('.', ','),
						},
					})),
					markLine:
						national === null
							? undefined
							: {
									silent: true,
									symbol: 'none',
									lineStyle: { type: 'dashed', width: 1, color: token('--ink-2') },
									label: {
										formatter: `España ${national.toFixed(3).replace('.', ',')}`,
										color: token('--ink-2'),
										// At the bottom end: the top is taken by the axis labels.
										position: 'end',
									},
									data: [{ xAxis: national }],
								},
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
		this.chart?.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: index });
	}

	clearFocus(): void {
		this.focusedIndex.set(null);
		this.chart?.dispatchAction({ type: 'hideTip' });
	}

	navigate(event: KeyboardEvent): void {
		const last = this.stats().provinces.length - 1;
		const index = this.focusedIndex() ?? 0;
		const next: Record<string, number> = {
			ArrowDown: Math.min(last, index + 1),
			ArrowUp: Math.max(0, index - 1),
			Home: 0,
			End: last,
		};
		if (event.key in next) {
			event.preventDefault();
			this.focusPoint(next[event.key]);
		} else if (event.key === 'Escape') this.clearFocus();
	}
}
