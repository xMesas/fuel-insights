import { OpeningWeek } from './price-models';
import { liveStation } from './live-fixture';
import {
	appleDirections,
	googleDirections,
	googlePlace,
	openLabel,
	openState,
	shareText,
	wazeDirections,
	amountAnswer,
	zoneComparison,
	zoneRanking,
	ZoneRow,
	siteLink,
	STATION_PARAM,
	CHARGING_PARAM,
} from './station-functions';

const daily = (from: string, to: string): OpeningWeek =>
	Array.from({ length: 7 }, () => [[from, to]]);

describe('opening hours in Madrid', () => {
	it('recognizes a continuous 24 hour week', () => {
		expect(openState(daily('00:00', '24:00'), new Date('2026-10-29T14:00:00Z'))).toEqual({
			kind: 'always',
		});
	});
	it('reports the closing time while open', () => {
		expect(openState(daily('07:00', '22:00'), new Date('2026-10-29T14:00:00Z'))).toEqual({
			kind: 'open',
			closesAt: '22:00',
		});
	});
	it('reports the next opening on the same day', () => {
		expect(openState(daily('07:00', '22:00'), new Date('2026-10-29T04:00:00Z'))).toEqual({
			kind: 'closed',
			opensAt: '07:00',
		});
	});
	it('wraps Sunday into Monday', () => {
		const week = daily('07:00', '22:00');
		week[6] = [];
		expect(openState(week, new Date('2026-11-01T14:00:00Z'))).toEqual({
			kind: 'closed',
			opensAt: '07:00',
			day: 'mañana',
		});
	});
	it('names a later weekday when the next day is closed', () => {
		const week: OpeningWeek = [[['07:00', '22:00']], [], [], [], [], [], []];
		expect(openState(week, new Date('2026-10-30T14:00:00Z'))).toEqual({
			kind: 'closed',
			opensAt: '07:00',
			day: 'el lunes',
		});
	});
	it('keeps the previous day overnight range open', () => {
		const week: OpeningWeek = [[], [], [['22:00', '02:00']], [], [], [], []];
		expect(openState(week, new Date('2026-10-29T00:30:00Z'))).toEqual({
			kind: 'open',
			closesAt: '02:00',
		});
		expect(openState(week, new Date('2026-10-29T01:00:00Z')).kind).toBe('closed');
	});
	it('handles split days and exact opening and closing boundaries', () => {
		const week: OpeningWeek = Array.from({ length: 7 }, () => [
			['07:00', '12:00'],
			['15:00', '24:00'],
		]);
		expect(openState(week, new Date('2026-10-29T11:00:00Z'))).toEqual({
			kind: 'closed',
			opensAt: '15:00',
		});
		expect(openState(week, new Date('2026-10-29T14:00:00Z'))).toEqual({
			kind: 'open',
			closesAt: '00:00',
		});
	});
	it('uses summer Madrid time', () => {
		expect(openState(daily('07:00', '22:00'), new Date('2026-07-01T05:00:00Z')).kind).toBe('open');
	});
	it('treats null and a fully closed week as unknown', () => {
		for (const week of [null, Array.from({ length: 7 }, () => [])])
			expect(openState(week, new Date())).toEqual({ kind: 'unknown' });
	});
	it('formats every opening label and falls back to the source schedule', () => {
		expect(openLabel({ kind: 'always' }, '')).toBe('Abierta 24 h');
		expect(openLabel({ kind: 'open', closesAt: '22:00' }, '')).toBe('Abierta · cierra a las 22:00');
		expect(openLabel({ kind: 'closed', opensAt: '07:00' }, '')).toBe('Cerrada · abre a las 07:00');
		expect(openLabel({ kind: 'closed', opensAt: '07:00', day: 'mañana' }, '')).toBe(
			'Cerrada · abre mañana a las 07:00',
		);
		expect(openLabel({ kind: 'closed', opensAt: '07:00', day: 'el lunes' }, '')).toBe(
			'Cerrada · abre el lunes a las 07:00',
		);
		expect(openLabel({ kind: 'unknown' }, 'Festivos: consultar')).toBe('Festivos: consultar');
	});
});

describe('station comparisons and sharing', () => {
	it('expresses cheaper dearer and equal prices in cents', () => {
		expect(zoneComparison(1.729, 1.77)).toEqual({
			cents: -4.1,
			label: '4,1 céntimos menos que la media de la zona',
		});
		expect(zoneComparison(1.79, 1.77).label).toBe('2,0 céntimos más que la media de la zona');
		expect(zoneComparison(1.7709, 1.77).label).toBe('En la media de la zona');
	});
	it('builds all destination links with five decimal coordinates and encoded names', () => {
		const station = liveStation();
		expect(googleDirections(station)).toBe(
			'https://www.google.com/maps/dir/?api=1&destination=39.21142,-1.53917',
		);
		expect(wazeDirections(station)).toBe('https://waze.com/ul?ll=39.21142,-1.53917&navigate=yes');
		expect(appleDirections(station, 'Área & Sol')).toBe(
			'https://maps.apple.com/?daddr=39.21142,-1.53917&q=%C3%81rea%20%26%20Sol',
		);
		expect(googlePlace(station)).toBe(
			'https://www.google.com/maps/search/?api=1&query=39.21142,-1.53917',
		);
	});
	it('shares the selected price and Ministry time in Madrid', () => {
		expect(shareText(liveStation(), 'Gasóleo A', 1.829)).toBe(
			'Nº 4375, AVENIDA CASTILLA LA MANCHA, 26, Abengibre. Gasóleo A: 1,829 €/l (precio del Ministerio de las 13:45).',
		);
	});
});

describe('ranking in the zone and what the driver pays', () => {
	const row = (id: number, price: number, distanceKm: number): ZoneRow => ({
		point: [id, 40, -3, price],
		distanceKm,
	});
	const zone = [row(1, 1.769, 2), row(2, 1.769, 1), row(3, 1.779, 0.5), row(4, 1.899, 3)];

	it('shares the first place between stations with the same price', () => {
		expect(zoneRanking(zone, 1)?.rank).toBe(1);
		expect(zoneRanking(zone, 2)?.rank).toBe(1);
		expect(zoneRanking(zone, 3)?.rank).toBe(3);
	});

	it('points the cheapest to the next one up and the rest to the cheapest', () => {
		expect(zoneRanking(zone, 3)?.alternative).toEqual({ point: zone[1].point, kind: 'cheapest' });
		expect(zoneRanking([row(1, 1.7, 1), row(5, 1.8, 2)], 1)?.alternative).toEqual({
			point: [5, 40, -3, 1.8],
			kind: 'next',
		});
	});

	it('counts and averages the whole zone', () => {
		const ranking = zoneRanking(zone, 4)!;
		expect(ranking.total).toBe(4);
		expect(ranking.average).toBeCloseTo(1.804, 3);
	});

	it('gives no ranking to a station outside the zone or alone in it', () => {
		expect(zoneRanking(zone, 99)).toBeNull();
		expect(zoneRanking([row(1, 1.7, 0)], 1)?.alternative).toBeNull();
	});

	it('answers a sum in litres and the saving against the zone', () => {
		expect(amountAnswer(1.769, 1.812, { kind: 'euros', euros: 20 })).toBe(
			'Con 20 €: 11,3 l. Te ahorras 0,49 € frente a la media de la zona.',
		);
	});

	it('answers a full tank and what is paid above the zone', () => {
		expect(amountAnswer(1.899, 1.891, { kind: 'full', litres: 50 })).toBe(
			'Lleno (50 l): 94,95 €. Pagas 0,40 € más que la media de la zona.',
		);
	});

	it('uses the fuel unit and works without a zone', () => {
		expect(amountAnswer(1.958, null, { kind: 'euros', euros: 10 }, 'kg')).toBe('Con 10 €: 5,1 kg.');
	});

	it('links to this site with the card to open, never to another map', () => {
		expect(siteLink(STATION_PARAM, 4375, 'https://example.test')).toBe(
			'https://example.test/?gasolinera=4375',
		);
		expect(siteLink(CHARGING_PARAM, 'E-28/1', 'https://example.test')).toBe(
			'https://example.test/?recarga=E-28%2F1',
		);
	});
});
