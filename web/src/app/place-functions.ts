import type { Polygon } from 'geojson';
import { Coordinates, NearbyOrder, Place, StationPoint } from './price-models';

const EARTH_RADIUS = 6371;
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (angle: number) => (angle * 180) / Math.PI;
const collator = new Intl.Collator('es');

export function normalizeForSearch(text: string): string {
	return text
		.toLocaleLowerCase('es')
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.replace(/['’ʼ`]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function searchPlaces(places: readonly Place[], query: string, limit = 6): Place[] {
	const normalized = normalizeForSearch(query);
	if (!normalized) return [];
	return places
		.map((place) => {
			const names = place[0].split('/').map(normalizeForSearch);
			const prefix = names.some((name) => name.startsWith(normalized));
			const words = names.some((name) =>
				name
					.split(' ')
					.some((_, index, words) => words.slice(index).join(' ').startsWith(normalized)),
			);
			return { place, rank: prefix ? 0 : words ? 1 : 2 };
		})
		.filter((row) => row.rank < 2)
		.sort(
			(a, b) =>
				a.rank - b.rank || b.place[4] - a.place[4] || collator.compare(a.place[0], b.place[0]),
		)
		.slice(0, Math.max(0, limit))
		.map((row) => row.place);
}

export function distanceKm(a: Coordinates, b: Coordinates): number {
	const latitude = radians(b.latitude - a.latitude);
	const longitude = radians(b.longitude - a.longitude);
	const h =
		Math.sin(latitude / 2) ** 2 +
		Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitude / 2) ** 2;
	return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function nearbyStations(
	stations: readonly StationPoint[],
	origin: Coordinates,
	radiusKm: number,
	order: NearbyOrder,
): { point: StationPoint; distanceKm: number }[] {
	return stations
		.map((point) => ({
			point,
			distanceKm: distanceKm(origin, { latitude: point[1], longitude: point[2] }),
		}))
		.filter((row) => row.distanceKm <= radiusKm)
		.sort((a, b) =>
			order === 'price'
				? a.point[3] - b.point[3] || a.distanceKm - b.distanceKm || a.point[0] - b.point[0]
				: a.distanceKm - b.distanceKm || a.point[3] - b.point[3] || a.point[0] - b.point[0],
		);
}

export function circlePolygon(center: Coordinates, radiusKm: number, steps = 64): Polygon {
	const latitude = radians(center.latitude);
	const longitude = radians(center.longitude);
	const angularDistance = radiusKm / EARTH_RADIUS;
	const ring = Array.from({ length: Math.max(3, steps) }, (_, index) => {
		const bearing = (2 * Math.PI * index) / Math.max(3, steps);
		const lat = Math.asin(
			Math.sin(latitude) * Math.cos(angularDistance) +
				Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
		);
		const lon =
			longitude +
			Math.atan2(
				Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
				Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(lat),
			);
		return [degrees(lon), degrees(lat)];
	});
	ring.push([...ring[0]]);
	return { type: 'Polygon', coordinates: [ring] };
}
