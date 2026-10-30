import { HttpResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { of } from 'rxjs';
import { StatisticsCharts } from './statistics-charts';
import { brandStats, spreadStats, weekdayStats } from './statistics-fixture';

describe('Statistics server rendering', () => {
	it('includes all conclusions and tables in the HTML without loading chart canvases', async () => {
		const html = await renderApplication(
			(context) =>
				bootstrapApplication(
					StatisticsCharts,
					{
						providers: [
							provideServerRendering(),
							provideHttpClient(
								withInterceptors([
									(request) => {
										const data = request.url.endsWith('/weekdays')
											? weekdayStats
											: request.url.endsWith('/spread')
												? spreadStats
												: brandStats;
										return of(new HttpResponse({ body: data }));
									},
								]),
							),
						],
					},
					context,
				),
			{
				document:
					'<html><head></head><body><app-statistics-charts></app-statistics-charts></body></html>',
				url: 'http://localhost/estadisticas',
				allowedHosts: ['localhost'],
			},
		);
		expect(html).toContain('el lunes fue el día más barato');
		expect(html).toContain('20,0 céntimos por litro: 10,00 €');
		expect(html).toContain('bonÀrea es la marca más barata');
		expect(html.match(/<table\b/g)).toHaveLength(3);
		expect(html).not.toContain('<app-statistics-plot');
	});
});
