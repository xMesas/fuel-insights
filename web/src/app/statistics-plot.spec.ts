import { statisticsOptions } from './statistics-plot';

describe('Statistics plot options', () => {
	const token = (name: string) => name;
	it('plots weekday deviations in their supplied Monday to Sunday order around zero', () => {
		const options = statisticsOptions(
			'weekdays',
			[
				{ label: 'lunes', value: -0.12 },
				{ label: 'domingo', value: 0.28 },
			],
			null,
			token,
		);
		expect(options.xAxis).toMatchObject({ type: 'category', data: ['lunes', 'domingo'] });
		expect(options.series).toMatchObject([
			{ type: 'bar', data: [-0.12, 0.28], markLine: { data: [{ yAxis: 0 }] } },
		]);
	});
	it('draws a thin range with endpoints at the actual percentiles', () => {
		const options = statisticsOptions(
			'spread',
			[{ label: 'Álava', value: 1.7, end: 1.9 }],
			null,
			token,
		);
		expect(options.xAxis).toMatchObject({ min: 1.69 });
		expect(options.series).toMatchObject([
			{ type: 'bar', data: [1.7], itemStyle: { color: 'transparent' } },
			{ type: 'bar', barWidth: 2 },
			{ type: 'scatter', data: [[1.7, 0]], symbolSize: 8 },
			{ type: 'scatter', data: [[1.9, 0]], symbolSize: 8 },
		]);
	});
	it('keeps price bars based at zero with a labelled national reference', () => {
		const options = statisticsOptions('brands', [{ label: 'bonÀrea', value: 1.7 }], 1.8, token);
		expect(options.xAxis).toMatchObject({ type: 'value', min: undefined });
		expect(options.yAxis).toMatchObject({ inverse: true });
		expect(options.series).toMatchObject([
			{
				type: 'bar',
				itemStyle: { color: '--data' },
				markLine: { data: [{ xAxis: 1.8, label: { formatter: 'Media de España' } }] },
			},
		]);
	});
});
