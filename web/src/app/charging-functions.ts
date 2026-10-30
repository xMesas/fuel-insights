import { decimal, effectiveDate } from './price-format';
import { distanceKm } from './place-functions';
import { ChargingPoint, Coordinates, ViewBounds } from './price-models';

export interface PowerBand {
	name: string;
	range: string;
	upTo: number;
}

// The usual classes of public charging, slowest first. A site takes the class of its most powerful connector.
export const POWER_BANDS: PowerBand[] = [
	{ name: 'Lenta', range: 'hasta 7,4 kW', upTo: 7.4 },
	{ name: 'Semirrápida', range: '7,4–22 kW', upTo: 22 },
	{ name: 'Rápida', range: '22–50 kW', upTo: 50 },
	{ name: 'Muy rápida', range: '50–150 kW', upTo: 150 },
	{ name: 'Ultrarrápida', range: 'más de 150 kW', upTo: Infinity },
];

// One hue, brighter (dark map) or darker (light map) as the power grows; validated as ordinal ramps (MASTER.md).
// Not the price traffic light: power is not a price, so a charging dot must never read as cheap or dear.
export const POWER_COLOURS = ['#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'];
export const LIGHT_POWER_COLOURS = ['#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

export function bandOf(powerKw: number): number {
	return POWER_BANDS.findIndex((band) => powerKw <= band.upTo);
}

export function powerText(powerKw: number): string {
	return `${decimal(powerKw, Number.isInteger(powerKw) ? 0 : 1)} kW`;
}

export function chargingFreshness(updatedAt: string): string {
	return `Puntos de recarga del Ministerio para la Transición Ecológica, ${effectiveDate(updatedAt.slice(0, 10))}`;
}

function inBounds([, latitude, longitude]: ChargingPoint, bounds: ViewBounds): boolean {
	return (
		latitude >= bounds.south &&
		latitude <= bounds.north &&
		longitude >= bounds.west &&
		longitude <= bounds.east
	);
}

/** The sites a board or list describes: the search circle when there is one, otherwise the map. */
export function chargingInScope(
	sites: readonly ChargingPoint[],
	bounds: ViewBounds,
	origin: Coordinates | null,
	radiusKm: number,
): { point: ChargingPoint; distanceKm: number | null }[] {
	if (!origin)
		return sites
			.filter((site) => inBounds(site, bounds))
			.map((point) => ({ point, distanceKm: null }));
	return sites
		.map((point) => ({
			point,
			distanceKm: distanceKm(origin, { latitude: point[1], longitude: point[2] }),
		}))
		.filter((row) => row.distanceKm <= radiusKm);
}

/** How many sites of each class, slowest first. */
export function bandCounts(sites: readonly ChargingPoint[]): number[] {
	const counts = POWER_BANDS.map(() => 0);
	for (const site of sites) counts[bandOf(site[3])]++;
	return counts;
}

/** Nearest first around a search, most powerful first on the map; ties by more charging points. */
export function sortCharging(
	rows: { point: ChargingPoint; distanceKm: number | null }[],
): { point: ChargingPoint; distanceKm: number | null }[] {
	return rows.toSorted(
		(a, b) =>
			(a.distanceKm ?? 0) - (b.distanceKm ?? 0) ||
			b.point[3] - a.point[3] ||
			b.point[4] - a.point[4] ||
			a.point[0].localeCompare(b.point[0]),
	);
}
