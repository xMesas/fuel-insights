import type { FeatureCollection } from 'geojson';
import { areaQuintiles, joinAreas, municipalityKeys, normalizePlaceName } from './area-functions';

function boundaries(names: string[]): FeatureCollection {
	return {
		type: 'FeatureCollection',
		features: names.map((name, index) => ({
			type: 'Feature',
			id: '28' + String(index).padStart(3, '0'),
			properties: { name },
			geometry: { type: 'Polygon', coordinates: [] },
		})),
	};
}

describe('area joins', () => {
	it('normalizes accents case and Catalan apostrophes', () => {
		expect(normalizePlaceName("l'Alcora")).toBe(normalizePlaceName('L’Alcora'));
		expect(normalizePlaceName('Alcalá de Henares')).toBe('alcala de henares');
	});
	it('moves comma articles before the name', () => {
		expect(municipalityKeys('Rozas de Madrid, Las')).toContain(
			normalizePlaceName('Las Rozas de Madrid'),
		);
	});
	it('matches either half of bilingual names', () => {
		const joined = joinAreas(boundaries(['La Vila Joiosa/Villajoyosa']), [
			['La Villajoyosa/Vila Joiosa', '28', 1.8, 2],
		]);
		expect(joined.features[0].properties?.['averagePrice']).toBe(1.8);
	});
	it('keeps unmatched towns unfilled and separates provinces with the same name', () => {
		const joined = joinAreas(boundaries(['Unknown', 'Toledo']), [['Toledo', '45', 1.8, 2]]);
		expect(joined.features.every((area) => area.properties?.['quintile'] === -1)).toBe(true);
	});
	it('joins comma articles and Catalan names to their prices', () => {
		const joined = joinAreas(boundaries(['Rozas de Madrid, Las', "l'Alcora"]), [
			['Las Rozas de Madrid', '28', 1.8, 2],
			["L'Alcora", '28', 1.9, 3],
		]);
		expect(joined.features.map((area) => area.properties?.['stations'])).toEqual([2, 3]);
	});
	it('joins provinces by INE code and preserves their boundary name', () => {
		const source = boundaries(['Madrid']);
		source.features[0].id = '28';
		expect(joinAreas(source, [['28', '28', 1.8, 3]], true).features[0].properties).toMatchObject({
			name: 'Madrid',
			averagePrice: 1.8,
		});
	});
	it('computes quintiles from averages and handles an empty selection', () => {
		expect(areaQuintiles([1, 2, 3, 4, 5].map((value) => ['Town', '28', value, 1]))).toEqual([
			1, 2, 3, 4,
		]);
		expect(areaQuintiles([])).toEqual([]);
	});
});
