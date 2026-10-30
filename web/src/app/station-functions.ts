import { Coordinates, OpeningWeek, StationDetail, StationPoint } from './price-models';
import { decimal, price } from './price-format';

type OpeningDay =
	| 'mañana'
	| 'el lunes'
	| 'el martes'
	| 'el miércoles'
	| 'el jueves'
	| 'el viernes'
	| 'el sábado'
	| 'el domingo';
export type OpenState =
	| { kind: 'always' }
	| { kind: 'open'; closesAt: string }
	| { kind: 'closed'; opensAt: string; day?: OpeningDay }
	| { kind: 'unknown' };

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clock = (minute: number) =>
	`${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const weekdays: OpeningDay[] = [
	'el lunes',
	'el martes',
	'el miércoles',
	'el jueves',
	'el viernes',
	'el sábado',
	'el domingo',
];

export function openState(week: OpeningWeek | null | undefined, now: Date): OpenState {
	if (!week || week.length !== 7 || !Number.isFinite(now.getTime())) return { kind: 'unknown' };
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Europe/Madrid',
		weekday: 'short',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(now);
	const part = (type: string) => parts.find((item) => item.type === type)!.value;
	const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(part('weekday'));
	const time = day * 1440 + Number(part('hour')) * 60 + Number(part('minute'));
	const ranges: [number, number][] = [];
	// Repeat the week to merge adjacent ranges, including the Sunday/Monday boundary.
	for (let repeat = -1; repeat <= 2; repeat++) {
		week.forEach((rangesOfDay, index) =>
			rangesOfDay.forEach(([from, to]) => {
				const start = minutes(from),
					end = minutes(to);
				if (start === end) return;
				const base = (repeat * 7 + index) * 1440;
				ranges.push([base + start, base + end + (end < start ? 1440 : 0)]);
			}),
		);
	}
	ranges.sort((a, b) => a[0] - b[0]);
	const merged: [number, number][] = [];
	for (const range of ranges) {
		const last = merged.at(-1);
		if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
		else merged.push([...range]);
	}
	const active = merged.find(([start, end]) => start <= time && time < end);
	if (active)
		return active[1] - active[0] >= 10080
			? { kind: 'always' }
			: { kind: 'open', closesAt: clock(active[1]) };
	const next = merged.find(([start]) => start > time);
	if (!next) return { kind: 'unknown' };
	const days = Math.floor(next[0] / 1440) - day;
	return {
		kind: 'closed',
		opensAt: clock(next[0]),
		...(days ? { day: days === 1 ? 'mañana' : weekdays[(day + days) % 7] } : {}),
	};
}

export function openLabel(state: OpenState, schedule: string): string {
	switch (state.kind) {
		case 'always':
			return 'Abierta 24 h';
		case 'open':
			return `Abierta · cierra a las ${state.closesAt}`;
		case 'closed':
			return `Cerrada · abre${state.day ? ` ${state.day}` : ''} a las ${state.opensAt}`;
		default:
			return schedule || 'Horario no disponible';
	}
}

export function zoneComparison(
	value: number,
	zoneAverage: number,
): { cents: number; label: string } {
	const cents = Math.round((value - zoneAverage) * 1000) / 10;
	return {
		cents,
		label:
			Math.abs(value - zoneAverage) <= 0.001 + Number.EPSILON
				? 'En la media de la zona'
				: `${decimal(Math.abs(cents), 1)} céntimos ${cents < 0 ? 'menos' : 'más'} que la media de la zona`,
	};
}

export interface ZoneRow {
	point: StationPoint;
	distanceKm: number;
}

export interface ZoneRanking {
	/** 1 for the cheapest; stations with the same price share it. */
	rank: number;
	total: number;
	average: number;
	/** The next one up when this is the cheapest, otherwise the cheapest of the zone. */
	alternative: { point: StationPoint; kind: 'next' | 'cheapest' } | null;
}

/** Where a station stands among the stations of its zone, by price. Null when it is not in the zone. */
export function zoneRanking(zone: readonly ZoneRow[], stationId: number): ZoneRanking | null {
	const own = zone.find((row) => row.point[0] === stationId);
	if (!own) return null;
	const price = own.point[3];
	const others = zone
		.filter((row) => row.point[0] !== stationId)
		.toSorted((a, b) => a.point[3] - b.point[3] || a.distanceKm - b.distanceKm);
	const rank = zone.filter((row) => row.point[3] < price).length + 1;
	const cheapest = others.find((row) => row.point[3] < price);
	const next = others.find((row) => row.point[3] >= price);
	const alternative = cheapest
		? { point: others[0].point, kind: 'cheapest' as const }
		: next
			? { point: next.point, kind: 'next' as const }
			: null;
	return {
		rank,
		total: zone.length,
		average: zone.reduce((sum, row) => sum + row.point[3], 0) / zone.length,
		alternative,
	};
}

export type Amount = { kind: 'euros'; euros: number } | { kind: 'full'; litres: number };

/** What a driver gets for a sum, or pays for a full tank, here and against the zone average. */
export function amountAnswer(
	value: number,
	zoneAverage: number | null,
	amount: Amount,
	unit = 'l',
): string {
	const money = (euros: number) => `${decimal(euros, 2)} €`;
	let first: string;
	let difference: number | null = null;
	if (amount.kind === 'euros') {
		const quantity = amount.euros / value;
		const sum = Number.isInteger(amount.euros) ? `${amount.euros} €` : money(amount.euros);
		first = `Con ${sum}: ${decimal(quantity, 1)} ${unit}.`;
		if (zoneAverage !== null) difference = zoneAverage * quantity - amount.euros;
	} else {
		first = `Lleno (${amount.litres} l): ${money(value * amount.litres)}.`;
		if (zoneAverage !== null) difference = (zoneAverage - value) * amount.litres;
	}
	if (difference === null) return first;
	const rounded = Math.round(difference * 100) / 100;
	if (rounded === 0) return `${first} Lo mismo que la media de la zona.`;
	return rounded > 0
		? `${first} Te ahorras ${money(rounded)} frente a la media de la zona.`
		: `${first} Pagas ${money(-rounded)} más que la media de la zona.`;
}

const position = (point: Coordinates) =>
	`${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
export const googleDirections = (point: Coordinates) =>
	`https://www.google.com/maps/dir/?api=1&destination=${position(point)}`;
export const wazeDirections = (point: Coordinates) =>
	`https://waze.com/ul?ll=${position(point)}&navigate=yes`;
export const appleDirections = (point: Coordinates, name: string) =>
	`https://maps.apple.com/?daddr=${position(point)}&q=${encodeURIComponent(name)}`;
export const googlePlace = (point: Coordinates) =>
	`https://www.google.com/maps/search/?api=1&query=${position(point)}`;

/** A link to this site that opens one station or charging site: what "Compartir" sends. */
export const STATION_PARAM = 'gasolinera';
export const CHARGING_PARAM = 'recarga';
export function siteLink(param: string, id: number | string, origin = location.origin): string {
	return `${origin}/?${param}=${encodeURIComponent(String(id))}`;
}
export function shareText(station: StationDetail, fuelName: string, value: number | null): string {
	const time = new Intl.DateTimeFormat('es-ES', {
		timeZone: 'Europe/Madrid',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).format(new Date(station.updatedAt));
	return `${station.name}, ${station.address}, ${station.municipality}. ${fuelName}: ${value === null ? 'sin precio' : price(value)} (precio del Ministerio de las ${time}).`;
}
