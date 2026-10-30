import { ProvinceStats } from './price-models';

export const sampleStats: ProvinceStats = {
	fuel: { code: 'GASOLEO_A', name: 'Gasóleo A', unit: 'l', main: true },
	date: '2026-10-27',
	importedAt: '2026-10-28T14:05:12Z',
	national: {
		averagePrice: 1.459,
		medianPrice: 1.449,
		minPrice: 1.199,
		maxPrice: 1.999,
		stations: 11203,
	},
	provinces: [
		{
			provinceId: '38',
			province: 'Santa Cruz de Tenerife',
			averagePrice: 1.152,
			medianPrice: 1.149,
			minPrice: 0.999,
			maxPrice: 1.299,
			stations: 210,
		},
		{
			provinceId: '08',
			province: 'Barcelona',
			averagePrice: 1.689,
			medianPrice: 1.679,
			minPrice: 1.399,
			maxPrice: 1.999,
			stations: 800,
		},
	],
};
