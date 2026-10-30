import { isPlatformBrowser } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	inject,
	input,
	PLATFORM_ID,
	signal,
} from '@angular/core';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import * as echarts from 'echarts/core';
import { BarChart, ScatterChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import { decimal, price } from './price-format';

echarts.use([
	BarChart,
	ScatterChart,
	GridComponent,
	MarkLineComponent,
	TooltipComponent,
	SVGRenderer,
]);

export interface PlotRow {
	label: string;
	value: number;
	end?: number;
}

export function statisticsOptions(
	kind: 'weekdays' | 'spread' | 'brands',
	rows: PlotRow[],
	reference: number | null,
	token: (name: string) => string,
): EChartsOption {
	const weekdays = kind === 'weekdays';
	const category = {
		type: 'category' as const,
		data: rows.map((row) => row.label),
		inverse: !weekdays,
		axisTick: { show: false },
		axisLine: { lineStyle: { color: token('--axis') } },
		axisLabel: {
			color: token('--ink-2'),
			interval: 0,
			...(weekdays ? { rotate: 35 } : { width: 118, overflow: 'truncate' as const }),
		},
	};
	const value = {
		type: 'value' as const,
		min:
			kind === 'spread' && rows.length
				? Math.min(...rows.map((row) => row.value)) - 0.01
				: undefined,
		name: weekdays ? 'Céntimos por litro' : '€/l',
		nameLocation: 'middle' as const,
		nameGap: 34,
		nameTextStyle: { color: token('--ink-2') },
		splitNumber: 3,
		axisLabel: { color: token('--ink-2'), formatter: (n: number) => decimal(n, weekdays ? 1 : 2) },
		splitLine: { lineStyle: { color: token('--grid') } },
	};
	const options: EChartsOption = {
		animation: false,
		textStyle: { fontFamily: 'Fira Sans', color: token('--ink-2') },
		grid: { left: weekdays ? 48 : 126, right: 20, top: 40, bottom: weekdays ? 70 : 55 },
		xAxis: weekdays ? category : value,
		yAxis: weekdays ? value : category,
		tooltip: {
			trigger: 'item',
			renderMode: 'richText',
			formatter: (params) => {
				const item = Array.isArray(params) ? params[0] : params;
				const row = rows[item.dataIndex];
				if (!row) return '';
				return `${weekdays ? decimal(row.value, 1) + ' céntimos/l' : price(row.value)}${row.end === undefined ? '' : ' – ' + price(row.end)}\n${row.label}`;
			},
		},
	};
	if (kind === 'spread') {
		options.series = [
			{
				type: 'bar',
				stack: 'range',
				silent: true,
				itemStyle: { color: 'transparent' },
				tooltip: { show: false },
				data: rows.map((row) => row.value),
			},
			{
				type: 'bar',
				stack: 'range',
				barWidth: 2,
				itemStyle: { color: token('--data') },
				data: rows.map((row) => (row.end ?? row.value) - row.value),
			},
			{
				type: 'scatter',
				symbolSize: 8,
				itemStyle: { color: token('--data') },
				data: rows.map((row, i) => [row.value, i]),
			},
			{
				type: 'scatter',
				symbolSize: 8,
				itemStyle: { color: token('--data') },
				data: rows.map((row, i) => [row.end ?? row.value, i]),
			},
		];
	} else {
		options.series = [
			{
				type: 'bar',
				barMaxWidth: 20,
				itemStyle: { color: token('--data'), borderRadius: 2 },
				data: rows.map((row) => row.value),
				markLine: {
					silent: true,
					symbol: 'none',
					lineStyle: { color: token('--ink-2'), width: 1, type: 'dashed' },
					data: weekdays
						? [{ yAxis: 0, label: { show: false } }]
						: reference === null
							? []
							: [
									{
										xAxis: reference,
										label: {
											formatter: 'Media de España',
											position: 'insideEndTop',
											color: token('--ink-2'),
										},
									},
								],
				},
			},
		];
	}
	return options;
}

@Component({
	selector: 'app-statistics-plot',
	imports: [NgxEchartsDirective],
	providers: [provideEchartsCore({ echarts })],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `<div
			echarts
			[options]="options()"
			[initOpts]="{ renderer: 'svg' }"
			[style.height.px]="height()"
			tabindex="0"
			role="group"
			[attr.aria-label]="label() + '. Los mismos datos están en Ver como tabla.'"
			(chartInit)="chart = $event"
			(focus)="focusRow(0)"
			(blur)="clearFocus()"
			(keydown)="navigate($event)"
		></div>
		<p role="status">{{ focusedDetail() }}</p>`,
	styles: `
		:host {
			display: block;
			min-width: 0;
		}
		div:focus-visible {
			outline: 2px solid var(--focus);
			outline-offset: 2px;
		}
		p {
			min-height: 42px;
			color: var(--ink-2);
			font-size: 14px;
		}
	`,
})
export class StatisticsPlot {
	readonly kind = input.required<'weekdays' | 'spread' | 'brands'>();
	readonly rows = input.required<PlotRow[]>();
	readonly label = input.required<string>();
	readonly reference = input<number | null>(null);
	private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
	private readonly themeVersion = signal(0);
	private readonly focusedIndex = signal<number | null>(null);
	chart?: echarts.ECharts;
	readonly focusedDetail = computed(() => {
		const index = this.focusedIndex();
		const row = index === null ? undefined : this.rows()[index];
		if (!row) return '';
		return `${row.label}: ${this.kind() === 'weekdays' ? decimal(row.value, 1) + ' céntimos por litro' : price(row.value)}${row.end === undefined ? '' : ' – ' + price(row.end)}.`;
	});
	readonly height = computed(() =>
		this.kind() === 'weekdays' ? 320 : this.rows().length * 30 + 80,
	);
	readonly options = computed(() => {
		if (!this.browser) return {};
		this.themeVersion();
		const css = getComputedStyle(document.documentElement);
		return statisticsOptions(this.kind(), this.rows(), this.reference(), (name) =>
			css.getPropertyValue(name).trim(),
		);
	});
	constructor() {
		if (!this.browser) return;
		const media = matchMedia('(prefers-color-scheme: dark)');
		const update = () => this.themeVersion.update((n) => n + 1);
		media.addEventListener('change', update);
		inject(DestroyRef).onDestroy(() => media.removeEventListener('change', update));
	}
	focusRow(index: number): void {
		if (!this.rows().length) return;
		const dataIndex = Math.max(0, Math.min(index, this.rows().length - 1));
		this.focusedIndex.set(dataIndex);
		this.chart?.dispatchAction({
			type: 'showTip',
			seriesIndex: this.kind() === 'spread' ? 2 : 0,
			dataIndex,
		});
	}
	clearFocus(): void {
		this.focusedIndex.set(null);
		this.chart?.dispatchAction({ type: 'hideTip' });
	}
	navigate(event: KeyboardEvent): void {
		const offset = ['ArrowDown', 'ArrowRight'].includes(event.key)
			? 1
			: ['ArrowUp', 'ArrowLeft'].includes(event.key)
				? -1
				: 0;
		if (!offset) return;
		event.preventDefault();
		this.focusRow((this.focusedIndex() ?? 0) + offset);
	}
}
