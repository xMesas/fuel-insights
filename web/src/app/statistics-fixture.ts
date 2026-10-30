import { BrandStats, SpreadStats, WeekdayStats } from './statistics-models';

const fuel = { code: 'GASOLEO_A', name: 'Gasóleo A', main: true, unit: 'l' };
export const weekdayStats: WeekdayStats = {
	fuel,
	from: '2025-11-01',
	to: '2026-10-25',
	weekdays: [
		{ weekday: 7, deviation: 0.0028, days: 51 },
		{ weekday: 1, deviation: -0.0012, days: 51 },
		{ weekday: 3, deviation: 0, days: 50 },
	],
};
const range = {
	provinceId: null,
	cheapPrice: 1.7,
	medianPrice: 1.8,
	dearPrice: 1.9,
	minPrice: 1.5,
	maxPrice: 2.1,
	stations: 100,
};
export const spreadStats: SpreadStats = {
	fuel,
	updatedAt: '2026-10-29T21:45:00+01:00',
	spain: range,
	provinces: [
		{ ...range, provinceId: '08', cheapPrice: 1.8 },
		{ ...range, provinceId: '01' },
	],
};
export const brandStats: BrandStats = {
	fuel,
	updatedAt: spreadStats.updatedAt,
	nationalAverage: 1.8,
	brands: [
		{ code: 'REPSOL', name: 'Repsol', averagePrice: 1.9, minPrice: 1.7, stations: 500 },
		{ code: 'BONAREA', name: 'bonÀrea', averagePrice: 1.7, minPrice: 1.5, stations: 80 },
	],
};
