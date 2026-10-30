import { Fuel } from './price-models';

export interface WeekdayStats {
	fuel: Fuel;
	from: string;
	to: string;
	weekdays: { weekday: number; deviation: number; days: number }[];
}
export interface SpreadRow {
	provinceId: string | null;
	cheapPrice: number;
	medianPrice: number;
	dearPrice: number;
	minPrice: number;
	maxPrice: number;
	stations: number;
}
export interface SpreadStats {
	updatedAt: string;
	fuel: Fuel;
	spain: SpreadRow;
	provinces: SpreadRow[];
}
export interface BrandStats {
	updatedAt: string;
	fuel: Fuel;
	nationalAverage: number;
	brands: {
		code: string;
		name: string;
		averagePrice: number;
		minPrice: number;
		stations: number;
	}[];
}
