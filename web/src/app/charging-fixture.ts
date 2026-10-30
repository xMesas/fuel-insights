import { ChargingPoint, ChargingSite, ChargingSnapshot } from './price-models';

// Around Getafe (40.3057, -3.7329): one site of each class, slowest first; the fastest is in Zaragoza.
export const chargingPoints: ChargingPoint[] = [
	['SLOW', 40.306, -3.733, 3.7, 1],
	['SEMI', 40.31, -3.73, 22, 2],
	['FAST', 40.32, -3.72, 50, 2],
	['RAPID', 40.4, -3.7, 150, 4],
	['ULTRA', 41.65, -0.88, 350, 6],
];

export const chargingSnapshot: ChargingSnapshot = {
	updatedAt: '2026-10-29T10:16:20+01:00',
	sites: chargingPoints,
};

export const chargingSite: ChargingSite = {
	id: 'FAST',
	name: null,
	operator: 'Iberdrola',
	address: 'Calle Madrid 12',
	town: 'Getafe',
	province: 'Madrid',
	postalCode: '28901',
	latitude: 40.32,
	longitude: -3.72,
	maxPowerKw: 50,
	points: 2,
	connectors: [
		{ type: 'CCS2', current: 'DC', powerKw: 50, count: 2 },
		{ type: 'Tipo 2', current: 'AC', powerKw: 22, count: 2 },
	],
	payment: ['App', 'Tarjeta bancaria'],
	schedule: null,
	openingHours: null,
	siteUpdatedAt: '2026-09-02T08:00:00+02:00',
	updatedAt: '2026-10-29T10:16:20+01:00',
};
