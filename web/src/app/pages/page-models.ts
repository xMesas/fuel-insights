import { DatedAverage, Fuel, OpeningWeek } from '../price-models';

export interface PageArea {
	name: string;
	slug: string;
}
export interface ProvinceLink extends PageArea {
	id: string;
}
export interface Figures {
	averagePrice: number;
	minPrice: number;
	maxPrice: number;
	stations: number;
	latestDay: DatedAverage | null;
	highestDay: DatedAverage | null;
}
export interface StationRow {
	id: number;
	slug: string;
	name: string;
	town: string;
	townSlug: string;
	province: string;
	provinceSlug: string;
	price: number;
}
export interface FuelPageData {
	updatedAt: string;
	fuel: Fuel;
	national: Figures;
	provinces: (PageArea & { averagePrice: number; minPrice: number; stations: number })[];
	cheapest: StationRow[];
}
export interface ProvinceFuel {
	fuel: Fuel;
	figures: Figures;
	nationalAverage: number;
	cheapest: StationRow[];
}
export interface ProvincePageData {
	updatedAt: string;
	province: PageArea;
	fuels: ProvinceFuel[];
	towns: (PageArea & { stations: number })[];
}
export interface TownStation {
	id: number;
	slug: string;
	name: string;
	address: string;
	latitude: number;
	longitude: number;
	schedule: string;
	openingHours: OpeningWeek | null;
	prices: Record<string, number>;
}
export interface TownPageData {
	updatedAt: string;
	province: PageArea;
	town: PageArea;
	fuels: {
		fuel: Fuel;
		averagePrice: number;
		minPrice: number;
		stations: number;
		provinceAverage: number;
	}[];
	stations: TownStation[];
}
export interface StationPageData {
	id: number;
	slug: string;
	province: PageArea;
	town: PageArea;
	nearby: {
		id: number;
		slug: string;
		name: string;
		town: string;
		distanceKm: number;
		prices: Record<string, number>;
	}[];
}
