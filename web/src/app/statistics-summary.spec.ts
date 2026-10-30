import { brandStats, spreadStats, weekdayStats } from './statistics-fixture';
import { brandConclusion, spreadConclusion, weekdayConclusion } from './statistics-summary';

describe('Statistics conclusions', () => {
	it('reports the measured weekday gap in cents with the period', () => {
		expect(weekdayConclusion(weekdayStats)).toBe(
			'Del 1 nov 2025 al 25 oct 2026, el lunes fue el día más barato para repostar Gasóleo A y el domingo el más caro, pero la diferencia es pequeña: 0,4 céntimos por litro.',
		);
	});
	it('does not call a large weekday gap small', () => {
		expect(
			weekdayConclusion({
				...weekdayStats,
				weekdays: [
					{ weekday: 1, deviation: 0, days: 5 },
					{ weekday: 2, deviation: 0.1, days: 5 },
				],
			}),
		).not.toContain('pequeña');
	});
	it('ignores weekdays without complete observations', () => {
		expect(
			weekdayConclusion({
				...weekdayStats,
				weekdays: [...weekdayStats.weekdays, { weekday: 2, deviation: -1, days: 0 }],
			}),
		).toContain('el lunes');
	});
	it('reports equal weekdays without inventing a cheapest day', () => {
		expect(
			weekdayConclusion({
				...weekdayStats,
				weekdays: weekdayStats.weekdays.map((row) => ({ ...row, deviation: 0 })),
			}),
		).toContain('no hubo diferencias');
	});
	it('converts the national percentile gap to cents and a 50 litre tank', () => {
		expect(spreadConclusion(spreadStats)).toBe(
			'En España, elegir una de las gasolineras baratas en vez de una de las caras ahorra 20,0 céntimos por litro: 10,00 € en un depósito de 50 litros.',
		);
	});
	it('names both brand extremes with three decimal prices', () => {
		expect(brandConclusion(brandStats)).toBe(
			'bonÀrea es la marca más barata de media (1,700 €/l) y Repsol la más cara (1,900 €/l).',
		);
	});
	it('does not rank a sole brand against itself', () => {
		expect(brandConclusion({ ...brandStats, brands: [brandStats.brands[0]] })).toContain(
			'única marca',
		);
	});
	it('does not invent brand extremes when averages are tied', () => {
		expect(
			brandConclusion({
				...brandStats,
				brands: brandStats.brands.map((row) => ({ ...row, averagePrice: 1.8 })),
			}),
		).toContain('misma media');
	});
	it('does not build conclusions from empty samples', () => {
		expect(weekdayConclusion({ ...weekdayStats, weekdays: [] })).toBe('');
		expect(brandConclusion({ ...brandStats, brands: [] })).toBe('');
		expect(spreadConclusion({ ...spreadStats, spain: { ...spreadStats.spain, stations: 0 } })).toBe(
			'',
		);
	});
});
