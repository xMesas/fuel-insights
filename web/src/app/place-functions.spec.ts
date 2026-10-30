import {
	circlePolygon,
	distanceKm,
	nearbyStations,
	normalizeForSearch,
	searchPlaces,
} from './place-functions';
import { samplePlaces } from './place-fixture';
import { Place, StationPoint } from './price-models';

describe('place matching', () => {
	it('normalizes accents case apostrophes and repeated spaces', () => {
		expect(normalizeForSearch('  L’ÁLCORA  ')).toBe('l alcora');
		expect(normalizeForSearch('Alcalá   de Henares')).toBe('alcala de henares');
		expect(searchPlaces(samplePlaces, 'alcala')[0][0]).toBe('Alcalá de Henares');
		expect(searchPlaces(samplePlaces, 'hena')[0][0]).toBe('Alcalá de Henares');
		expect(searchPlaces(samplePlaces, 'alcora')[0][0]).toBe("L'Alcora");
	});
	it('matches either half of bilingual names', () => {
		expect(searchPlaces(samplePlaces, 'vila jo')[0][0]).toBe('Villajoyosa/Vila Joiosa');
		expect(searchPlaces(samplePlaces, 'villaj')[0][0]).toBe('Villajoyosa/Vila Joiosa');
	});
	it('ranks whole prefixes then station counts then Spanish names without mutating input', () => {
		const places: Place[] = [
			['La Alcalá', '01', 0, 0, 100],
			['Alcalá Z', '01', 0, 0, 5],
			['Alcalá Á', '01', 0, 0, 5],
			['Alcalá Norte', '01', 0, 0, 20],
		];
		expect(searchPlaces(places, 'alcala').map((place) => place[0])).toEqual([
			'Alcalá Norte',
			'Alcalá Á',
			'Alcalá Z',
			'La Alcalá',
		]);
		expect(places[0][0]).toBe('La Alcalá');
		expect(searchPlaces(places, 'alcala', 2)).toHaveLength(2);
	});
	it('returns no suggestions for empty or unmatched text', () => {
		expect(searchPlaces(samplePlaces, '   ')).toEqual([]);
		expect(searchPlaces(samplePlaces, 'xyz')).toEqual([]);
	});
});

describe('geographic search', () => {
	const origin = { latitude: 40.4169, longitude: -3.7035 };
	it('measures the known distance from Puerta del Sol to Toledo', () => {
		expect(distanceKm(origin, { latitude: 39.8628, longitude: -4.0273 })).toBeGreaterThan(66);
		expect(distanceKm(origin, { latitude: 39.8628, longitude: -4.0273 })).toBeLessThan(68);
		expect(distanceKm(origin, origin)).toBe(0);
	});
	it('filters by radius and sorts by price distance and id', () => {
		const stations: StationPoint[] = [
			[3, 40.4269, -3.7035, 1.5],
			[2, 40.4169, -3.7035, 1.6],
			[1, 40.4269, -3.7035, 1.5],
			[4, 41, -3.7, 1],
		];
		expect(nearbyStations(stations, origin, 10, 'price').map((row) => row.point[0])).toEqual([
			1, 3, 2,
		]);
		expect(nearbyStations(stations, origin, 10, 'distance').map((row) => row.point[0])).toEqual([
			2, 1, 3,
		]);
		expect(nearbyStations(stations, origin, 0, 'distance').map((row) => row.point[0])).toEqual([2]);
		expect(stations[0][0]).toBe(3);
	});
	it('closes the geodesic ring in longitude latitude order at the requested radius', () => {
		const ring = circlePolygon(origin, 10).coordinates[0];
		expect(ring).toHaveLength(65);
		expect(ring[0]).toEqual(ring.at(-1));
		for (const [longitude, latitude] of ring)
			expect(distanceKm(origin, { longitude, latitude })).toBeCloseTo(10, 6);
		expect(ring[0][0]).toBeCloseTo(origin.longitude);
		expect(ring[0][1]).toBeGreaterThan(origin.latitude);
	});
});
