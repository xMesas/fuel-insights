import {
	bandCounts,
	bandOf,
	chargingFreshness,
	chargingInScope,
	powerText,
	sortCharging,
	LIGHT_POWER_COLOURS,
	POWER_COLOURS,
} from './charging-functions';
import { MAP_COLOURS } from './station-map';
import { chargingPoints } from './charging-fixture';

describe('charging functions', () => {
	it('puts each power at the top edge of its class', () => {
		expect([3.7, 7.4, 7.5, 22, 50, 150, 150.1, 1000].map(bandOf)).toEqual([0, 0, 1, 1, 2, 3, 4, 4]);
	});

	it('writes powers as drivers read them', () => {
		expect(powerText(350)).toBe('350 kW');
		expect(powerText(7.4)).toBe('7,4 kW');
	});

	it('counts the sites of each class, slowest first', () => {
		expect(bandCounts(chargingPoints)).toEqual([1, 1, 1, 1, 1]);
	});

	it('keeps the sites inside the search circle with their distance', () => {
		const spain = { west: -10, south: 35, east: 5, north: 44 };
		const rows = chargingInScope(
			chargingPoints,
			spain,
			{ latitude: 40.3057, longitude: -3.7329 },
			5,
		);
		expect(rows.map((row) => row.point[0])).toEqual(['SLOW', 'SEMI', 'FAST']);
		expect(rows[0].distanceKm).toBeLessThan(0.1);
	});

	it('keeps the sites on the map when there is no search', () => {
		const madrid = { west: -4, south: 40, east: -3, north: 41 };
		const rows = chargingInScope(chargingPoints, madrid, null, 10);
		expect(rows.map((row) => row.point[0])).toEqual(['SLOW', 'SEMI', 'FAST', 'RAPID']);
		expect(rows[0].distanceKm).toBeNull();
	});

	it('lists the nearest first around a search and the most powerful first on the map', () => {
		const onMap = sortCharging(chargingPoints.map((point) => ({ point, distanceKm: null })));
		expect(onMap.map((row) => row.point[0])).toEqual(['ULTRA', 'RAPID', 'FAST', 'SEMI', 'SLOW']);
		const nearby = sortCharging([
			{ point: chargingPoints[3], distanceKm: 2 },
			{ point: chargingPoints[0], distanceKm: 1 },
		]);
		expect(nearby.map((row) => row.point[0])).toEqual(['SLOW', 'RAPID']);
	});

	it('names the source and the day of the data', () => {
		expect(chargingFreshness('2026-10-29T10:16:20+01:00')).toBe(
			'Puntos de recarga del Ministerio para la Transición Ecológica, 29 oct 2026',
		);
	});

	it('never paints power with a price colour', () => {
		for (const colour of [...POWER_COLOURS, ...LIGHT_POWER_COLOURS])
			expect(MAP_COLOURS).not.toContain(colour);
	});
});
