import {
	cheapestInView,
	count,
	decimal,
	effectiveDate,
	freshness,
	importedDate,
	ledParts,
	price,
	provinceTitleCase,
	quintileBreaks,
	quintileOf,
	shortDate,
	splitLowTax,
	time,
	weekChange,
} from './price-format';
import { liveSnapshot } from './live-fixture';
import { sampleTrend } from './trend-fixture';

describe('provinceTitleCase', () => {
	it.each([
		['CORUÑA (A)', 'Coruña (A)'],
		['BALEARS (ILLES)', 'Balears (Illes)'],
		['PALMAS (LAS)', 'Palmas (Las)'],
		['ÁVILA', 'Ávila'],
		['SANTA CRUZ DE TENERIFE', 'Santa Cruz de Tenerife'],
		['VALENCIA / VALÈNCIA', 'Valencia / València'],
	])('formats %s as %s', (source, expected) => {
		expect(provinceTitleCase(source)).toBe(expected);
	});
});

describe('Spanish formatting', () => {
	it('formats prices and missing prices', () => {
		expect(price(1.899)).toBe('1,899 €/l');
		expect(price(null)).toBe('—');
		expect(decimal(1.8, 2)).toBe('1,80');
	});
	it('groups counts including four digit numbers', () => {
		expect(count(11196)).toBe('11.196');
		expect(count(1200)).toBe('1.200');
	});
	it('formats dates and times in Madrid independently of the host timezone', () => {
		expect(effectiveDate('2026-10-29')).toBe('29 oct 2026');
		expect(shortDate('2026-10-29')).toBe('29 oct');
		expect(time('2026-10-29T12:45:09Z')).toBe('13:45');
		expect(time('2026-07-29T12:45:09Z')).toBe('14:45');
		expect(importedDate('2026-10-28T23:45:00Z')).toBe('29 oct 2026 a las 00:45');
		expect(freshness('2026-10-29T13:45:09+01:00')).toBe(
			'Precios del Ministerio de las 13:45 del 29 oct',
		);
	});
	it('splits LED digits after rounding and keeps the dot', () => {
		expect(ledParts(1.899)).toEqual({ main: '1.89', last: '9' });
		expect(ledParts(1.8999)).toEqual({ main: '1.90', last: '0' });
		expect(ledParts(null)).toBeNull();
		expect(ledParts(NaN)).toBeNull();
	});
});

describe('weekChange', () => {
	const point = sampleTrend.points[0];
	const updatedAt = '2026-10-29T13:45:09+01:00';
	it('compares the current price with seven days before the snapshot instead of the latest daily point', () => {
		const trend = {
			...sampleTrend,
			points: [
				{ ...point, date: '2026-10-20', averagePrice: 1.2 },
				{ ...point, date: '2026-10-22', averagePrice: 1.887 },
				{ ...point, date: '2026-10-27', averagePrice: 1.8 },
			],
		};
		expect(weekChange(trend, 1.899, updatedAt)).toEqual({ change: 0.012, since: '2026-10-22' });
	});
	it('uses the Madrid date at midnight across month and daylight saving changes', () => {
		const trend = {
			...sampleTrend,
			points: [{ ...point, date: '2026-10-25', averagePrice: 1.788 }],
		};
		expect(weekChange(trend, 1.8, '2026-10-31T23:30:00Z')).toEqual({
			change: 0.012,
			since: '2026-10-25',
		});
	});
	it('does not substitute an adjacent day for a missing comparison', () => {
		expect(weekChange(sampleTrend, 1.899, updatedAt)).toBeNull();
		expect(weekChange(null, 1.899, updatedAt)).toBeNull();
	});
	it('hides the change when either price is null', () => {
		const trend = {
			...sampleTrend,
			points: [{ ...point, date: '2026-10-22', averagePrice: null }],
		};
		expect(weekChange(trend, 1.899, updatedAt)).toBeNull();
		expect(weekChange(sampleTrend, null, updatedAt)).toBeNull();
	});
});
describe('splitLowTax', () => {
	it('separates all four low tax provinces without reordering or mutating', () => {
		const rows = ['08', '52', '35', '02', '51', '38'].map((provinceId) => ({ provinceId }));
		expect(splitLowTax(rows)).toEqual({
			peninsula: [rows[0], rows[3]],
			lowTax: [rows[1], rows[2], rows[4], rows[5]],
		});
		expect(rows.map((row) => row.provinceId)).toEqual(['08', '52', '35', '02', '51', '38']);
	});
});

describe('quintiles', () => {
	it('uses nearest ranks without changing the price input', () => {
		const values = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
		expect(quintileBreaks(values)).toEqual([2, 4, 6, 8]);
		expect(values[0]).toBe(10);
		expect([1, 3, 5, 7, 9].map((value) => quintileOf(value, [2, 4, 6, 8]))).toEqual([
			0, 1, 2, 3, 4,
		]);
	});
	it('assigns tied boundary prices to the same lower class', () => {
		expect(quintileBreaks([1, 1, 1])).toEqual([1, 1, 1, 1]);
		expect(quintileOf(1, [1, 1, 1, 1])).toBe(0);
		expect(quintileBreaks([])).toEqual([]);
	});
});

describe('cheapestInView', () => {
	const bounds = { west: -2, east: 0, south: 38, north: 41 };
	it('returns ten visible stations sorted by price then ID', () => {
		const stations = [...liveSnapshot.stations].reverse();
		expect(cheapestInView(stations, bounds).map((row) => row[0])).toEqual(
			Array.from({ length: 10 }, (_, i) => 4375 + i),
		);
		expect(
			cheapestInView(
				[
					[2, 39, -1, 1.5],
					[1, 39, -1, 1.5],
				],
				bounds,
			).map((row) => row[0]),
		).toEqual([1, 2]);
		expect(stations[0][0]).toBe(4386);
	});
	it('includes boundaries and excludes coordinates outside them', () => {
		expect(
			cheapestInView(
				[
					[1, 38, -2, 1],
					[2, 41, 0, 2],
					[3, 42, -1, 0.5],
				],
				bounds,
				20,
			),
		).toHaveLength(2);
	});
	it('supports wrapped longitude bounds and empty views', () => {
		expect(
			cheapestInView(
				[
					[1, 0, 175, 1],
					[2, 0, -175, 1],
					[3, 0, 0, 1],
				],
				{ west: 170, east: -170, south: -10, north: 10 },
			),
		).toHaveLength(2);
		expect(cheapestInView([], bounds)).toEqual([]);
	});
});
