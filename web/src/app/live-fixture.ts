import { CurrentStats, Fuel, StationDetail, StationSnapshot } from './price-models';

export const liveFuels: Fuel[] = [
	{ code: 'GASOLEO_A', name: 'Gasóleo A', unit: 'l', main: true },
	{ code: 'GASOLINA_95_E5', name: 'Gasolina 95', unit: 'l', main: true },
	{ code: 'GASOLINA_98_E5', name: 'Gasolina 98', unit: 'l', main: true },
	{ code: 'GASOLEO_PREMIUM', name: 'Gasóleo Premium', unit: 'l', main: true },
];

export const liveAreas = [
	{ id: 'ES', name: 'España' },
	{ id: '08', name: 'Barcelona' },
	{ id: '02', name: 'Albacete' },
	{ id: '52', name: 'Melilla' },
];

export const liveCurrent: CurrentStats = {
	updatedAt: '2026-10-29T13:45:09+01:00',
	fuels: liveFuels.map((fuel, index) => ({
		fuel,
		averagePrice: index === 3 ? null : 1.899,
		medianPrice: index === 3 ? null : 1.935,
		minPrice: index === 3 ? null : 1.489,
		maxPrice: index === 3 ? null : 2.299,
		stations: index === 3 ? 0 : 11196,
		yesterday: index === 3 ? null : { date: '2026-10-28', averagePrice: 1.897 },
		maxDaily: index === 3 ? null : { date: '2026-06-14', averagePrice: 1.962 },
		provinces:
			index === 3
				? []
				: [
						{ provinceId: '52', averagePrice: 1.2, stations: 10 },
						{ provinceId: '02', averagePrice: 1.861, stations: 210 },
						{ provinceId: '08', averagePrice: 1.95, stations: 800 },
					],
	})),
};

export const liveSnapshot: StationSnapshot = {
	fuel: liveFuels[0],
	updatedAt: liveCurrent.updatedAt,
	stations: Array.from({ length: 12 }, (_, index) => [
		4375 + index,
		39.211417 + index / 100,
		-1.539167,
		1.729 + index / 100,
	]),
};

export function liveStation(id = 4375): StationDetail {
	return {
		id,
		name: `Nº ${id}`,
		address: 'AVENIDA CASTILLA LA MANCHA, 26',
		municipality: 'Abengibre',
		province: 'ALBACETE',
		provinceId: '02',
		openingHours: Array.from({ length: 7 }, () => [['07:00', '22:00']]),
		postalCode: '02250',
		latitude: 39.211417,
		longitude: -1.539167,
		schedule: 'L-D: 07:00-22:00',
		updatedAt: liveCurrent.updatedAt,
		prices: [{ fuel: liveFuels[0], price: 1.829 }],
		history: [{ fuel: 'GASOLEO_A', points: [{ date: '2026-10-28', price: 1.829 }] }],
	};
}
