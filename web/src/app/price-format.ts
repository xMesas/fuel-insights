import { PriceTrend, StationPoint, ViewBounds } from './price-models';

export function provinceTitleCase(name: string): string {
	return (
		name
			.toLocaleLowerCase('es')
			.replace(
				/\p{L}[\p{L}\p{M}]*/gu,
				(word) => word.charAt(0).toLocaleUpperCase('es') + word.slice(1),
			)
			// Linking words inside a name stay lower case: "Santa Cruz de Tenerife".
			.replace(/ (De|Del|Y) /g, (link) => link.toLocaleLowerCase('es'))
	);
}

export function decimal(value: number, digits = 3): string {
	return new Intl.NumberFormat('es-ES', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	}).format(value);
}

export function price(value: number | null, unit = 'l'): string {
	return value === null ? '—' : `${decimal(value)} €/${unit}`;
}

export function count(value: number): string {
	return new Intl.NumberFormat('es-ES', { useGrouping: 'always' }).format(value);
}

export function effectiveDate(value: string): string {
	return dateParts(value, true);
}

export function importedDate(value: string): string {
	return `${effectiveDate(value)} a las ${time(value)}`;
}

export function shortDate(value: string): string {
	return dateParts(value, false);
}

function dateParts(value: string, year: boolean): string {
	const parts = new Intl.DateTimeFormat('es-ES', {
		timeZone: 'Europe/Madrid',
		day: 'numeric',
		month: 'short',
		...(year ? { year: 'numeric' as const } : {}),
	}).formatToParts(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
	return parts
		.filter((part) => part.type !== 'literal')
		.map((part) => part.value.replace('.', ''))
		.join(' ');
}

export function time(value: string): string {
	return new Intl.DateTimeFormat('es-ES', {
		timeZone: 'Europe/Madrid',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(value));
}

export function freshness(value: string): string {
	return `Precios del Ministerio de las ${time(value)} del ${shortDate(value)}`;
}

export function ledParts(value: number | null): { main: string; last: string } | null {
	if (value === null || !Number.isFinite(value)) return null;
	const text = value.toFixed(3);
	return { main: text.slice(0, -1), last: text.slice(-1) };
}

export function weekChange(
	trend: PriceTrend | null,
	currentPrice: number | null,
	updatedAt: string,
): { change: number; since: string } | null {
	if (!trend || currentPrice === null) return null;
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Madrid',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(new Date(updatedAt));
	const part = (type: string) => parts.find((item) => item.type === type)!.value;
	const date = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() - 7);
	const since = date.toISOString().slice(0, 10);
	const earlier = trend.points.find((point) => point.date === since);
	return earlier?.averagePrice == null
		? null
		: { change: Number((currentPrice - earlier.averagePrice).toFixed(3)), since };
}

export function splitLowTax<T extends { provinceId: string }>(
	provinces: readonly T[],
): { peninsula: T[]; lowTax: T[] } {
	const lowIds = new Set(['35', '38', '51', '52']);
	return {
		peninsula: provinces.filter((row) => !lowIds.has(row.provinceId)),
		lowTax: provinces.filter((row) => lowIds.has(row.provinceId)),
	};
}

export function quintileBreaks(prices: readonly number[]): number[] {
	const sorted = prices.filter(Number.isFinite).toSorted((a, b) => a - b);
	if (!sorted.length) return [];
	return [1, 2, 3, 4].map((q) => sorted[Math.max(0, Math.ceil((sorted.length * q) / 5) - 1)]);
}

export function quintileOf(value: number, breaks: readonly number[]): number {
	const index = breaks.findIndex((cut) => value <= cut);
	return index === -1 ? 4 : index;
}

export function cheapestInView(
	stations: readonly StationPoint[],
	bounds: ViewBounds,
	n = 10,
): StationPoint[] {
	return stations
		.filter(
			([, lat, lon]) =>
				lat >= bounds.south &&
				lat <= bounds.north &&
				(bounds.east - bounds.west >= 360 ||
					(bounds.west <= bounds.east
						? lon >= bounds.west && lon <= bounds.east
						: lon >= bounds.west || lon <= bounds.east)),
		)
		.toSorted((a, b) => a[3] - b[3] || a[0] - b[0])
		.slice(0, Math.max(0, n));
}
