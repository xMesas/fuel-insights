import { liveFuels, liveStation } from '../live-fixture';
import { FuelPageData, ProvincePageData, StationPageData, TownPageData } from './page-models';

export const pageFuel = liveFuels[0];
export const updatedAt = '2026-10-29T22:00:00+01:00';
export const provinceLinks = [{ id: '08', name: 'Barcelona', slug: 'barcelona' }];
export const figures = {
	averagePrice: 1.898,
	minPrice: 1.499,
	maxPrice: 2.299,
	stations: 20,
	latestDay: { date: '2026-10-27', averagePrice: 1.899 },
	highestDay: { date: '2026-03-21', averagePrice: 1.942 },
};
export const cheapest = [
	{
		id: 4375,
		slug: '4375-repsol-sabadell',
		name: 'REPSOL',
		town: 'Sabadell',
		townSlug: 'sabadell',
		province: 'Barcelona',
		provinceSlug: 'barcelona',
		price: 1.499,
	},
];
export const fuelPage: FuelPageData = {
	updatedAt,
	fuel: pageFuel,
	national: figures,
	cheapest,
	provinces: [
		{ name: 'Barcelona', slug: 'barcelona', averagePrice: 1.898, minPrice: 1.499, stations: 20 },
	],
};
export const provincePage: ProvincePageData = {
	updatedAt,
	province: provinceLinks[0],
	fuels: [{ fuel: pageFuel, figures, nationalAverage: 1.93, cheapest }],
	towns: [{ name: 'Sabadell', slug: 'sabadell', stations: 2 }],
};
export const townPage: TownPageData = {
	updatedAt,
	province: provinceLinks[0],
	town: { name: 'Sabadell', slug: 'sabadell' },
	fuels: [
		{ fuel: pageFuel, averagePrice: 1.898, minPrice: 1.499, stations: 2, provinceAverage: 1.93 },
	],
	stations: [
		{
			id: 4375,
			slug: '4375-repsol-sabadell',
			name: 'REPSOL',
			address: 'Calle Uno 1',
			latitude: 41.5,
			longitude: 2.1,
			schedule: 'L-D: 24H',
			openingHours: null,
			prices: { GASOLEO_A: 1.899 },
		},
		{
			id: 4376,
			slug: '4376-plenoil-sabadell',
			name: 'PLENOIL',
			address: 'Calle Dos 2',
			latitude: 41.5,
			longitude: 2.1,
			schedule: 'L-D: 24H',
			openingHours: null,
			prices: { GASOLEO_A: 1.499 },
		},
	],
};
export const stationPage: StationPageData = {
	id: 4375,
	slug: '4375-repsol-sabadell',
	province: provinceLinks[0],
	town: townPage.town,
	nearby: [
		{
			id: 4376,
			slug: '4376-plenoil-sabadell',
			name: 'PLENOIL',
			town: 'Sabadell',
			distanceKm: 1.25,
			prices: { GASOLEO_A: 1.499 },
		},
	],
};
export const stationDetail = { ...liveStation(), name: 'REPSOL', updatedAt };
