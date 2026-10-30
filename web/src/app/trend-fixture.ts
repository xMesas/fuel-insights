import { PriceTrend } from './price-models';
import { sampleStats } from './price-fixture';

export const sampleTrend: PriceTrend = {
	fuel: sampleStats.fuel,
	area: { id: 'ES', name: 'España' },
	from: '2025-10-28',
	to: '2026-10-27',
	points: [
		{
			date: '2025-10-28',
			averagePrice: 1.534,
			medianPrice: 1.529,
			movingAverage7: null,
			stations: 11021,
		},
		{
			date: '2025-10-29',
			averagePrice: null,
			medianPrice: null,
			movingAverage7: null,
			stations: 0,
		},
		{
			date: '2026-10-27',
			averagePrice: 1.459,
			medianPrice: 1.449,
			movingAverage7: 1.465,
			stations: 11203,
		},
	],
};
