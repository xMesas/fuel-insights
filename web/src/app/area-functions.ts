import type { FeatureCollection, Geometry, Feature } from 'geojson';
import { quintileBreaks, quintileOf } from './price-format';
export type AreaRow = [name: string, provinceId: string, averagePrice: number, stations: number];
export type AreaView = 'stations' | 'municipalities' | 'provinces';
export function normalizePlaceName(name: string): string {
	return name
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLocaleLowerCase('es')
		.replace(/[’']/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}
export function municipalityKeys(name: string): string[] {
	const variants = name.split('/').flatMap((part) => {
		const comma = part.split(',').map((value) => value.trim());
		return [part, comma.length === 2 ? comma[1] + ' ' + comma[0] : part];
	});
	return [
		...new Set(
			variants.flatMap((value) => [
				normalizePlaceName(value),
				normalizePlaceName(value).replace(/^(el|la|los|las|els|les|es|sa|ses) /, ''),
			]),
		),
	];
}
export function areaQuintiles(rows: readonly AreaRow[]): number[] {
	return quintileBreaks(rows.map((row) => row[2]));
}
export function joinAreas(
	boundaries: FeatureCollection,
	rows: readonly AreaRow[],
	provinces = false,
): FeatureCollection {
	const index = new Map<string, AreaRow>();
	for (const row of rows)
		for (const key of municipalityKeys(row[0])) index.set(row[1] + ':' + key, row);
	const byProvince = new Map(rows.map((row) => [row[1], row]));
	const breaks = areaQuintiles(rows);
	return {
		type: 'FeatureCollection',
		features: boundaries.features.map((area) => {
			const id = String(area.id).padStart(provinces ? 2 : 5, '0');
			const row = provinces
				? byProvince.get(id)
				: municipalityKeys(String(area.properties?.['name'] ?? ''))
						.map((key) => index.get(id.slice(0, 2) + ':' + key))
						.find(Boolean);
			return {
				...area,
				properties: {
					...area.properties,
					name: provinces ? area.properties?.['name'] : (row?.[0] ?? area.properties?.['name']),
					provinceId: id.slice(0, 2),
					averagePrice: row?.[2] ?? null,
					stations: row?.[3] ?? 0,
					quintile: row ? quintileOf(row[2], breaks) : -1,
				},
			};
		}),
	};
}
export function areaBounds(area: Feature<Geometry>): [[number, number], [number, number]] {
	const points: number[][] = [];
	function visit(value: unknown): void {
		if (!Array.isArray(value)) return;
		if (typeof value[0] === 'number') points.push(value as number[]);
		else value.forEach(visit);
	}
	if ('coordinates' in area.geometry) visit(area.geometry.coordinates);
	return [
		[Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1]))],
		[Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))],
	];
}
