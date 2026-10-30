export interface Fuel {
	unit: string;
	main: boolean;
	code: string;
	name: string;
	shortName?: string;
}

/** The prices are null when no station sold the fuel that day. */
export interface NationalSummary {
	averagePrice: number | null;
	medianPrice: number | null;
	minPrice: number | null;
	maxPrice: number | null;
	stations: number;
}

export interface ProvincePrice {
	provinceId: string;
	province: string;
	averagePrice: number;
	medianPrice: number;
	minPrice: number;
	maxPrice: number;
	stations: number;
}

export interface Area {
	id: string;
	name: string;
}

export interface TrendPoint {
	date: string;
	averagePrice: number | null;
	medianPrice: number | null;
	movingAverage7: number | null;
	stations: number;
}

export interface PriceTrend {
	fuel: Fuel;
	area: Area;
	from: string;
	to: string;
	points: TrendPoint[];
}

export interface ProvinceStats {
	fuel: Fuel;
	date: string;
	importedAt: string;
	national: NationalSummary;
	provinces: ProvincePrice[];
}

export interface CurrentProvince {
	provinceId: string;
	averagePrice: number;
	stations: number;
}

export interface DatedAverage {
	date: string;
	averagePrice: number;
}

export interface CurrentFuel extends NationalSummary {
	fuel: Fuel;
	yesterday: DatedAverage | null;
	maxDaily: DatedAverage | null;
	provinces: CurrentProvince[];
}

export interface CurrentStats {
	updatedAt: string;
	fuels: CurrentFuel[];
}

export type StationPoint = [id: number, latitude: number, longitude: number, price: number];

export interface StationSnapshot {
	fuel: Fuel;
	updatedAt: string;
	stations: StationPoint[];
}

export interface StationDetail {
	id: number;
	name: string;
	address: string;
	municipality: string;
	province: string;
	provinceId: string;
	openingHours: OpeningWeek | null;
	postalCode: string;
	latitude: number;
	longitude: number;
	schedule: string;
	updatedAt: string;
	prices: { fuel: Fuel; price: number }[];
	history: { fuel: string; points: { date: string; price: number }[] }[];
}

export interface StationSummary {
	id: number;
	name: string;
	municipality: string;
	openingHours?: OpeningWeek | null;
}

export type OpeningWeek = [string, string][][];

export interface ViewBounds {
	west: number;
	south: number;
	east: number;
	north: number;
}

export type Place = [
	name: string,
	provinceId: string,
	latitude: number,
	longitude: number,
	stations: number,
];

export interface Coordinates {
	latitude: number;
	longitude: number;
}

export interface SearchOrigin extends Coordinates {
	name: string;
}

export interface GeocodeResult {
	id: string;
	type: string;
	kind: string;
	label: string;
	town: string;
	province: string;
	latitude: number | null;
	longitude: number | null;
}

export type NearbyOrder = 'price' | 'distance';

/** The board's figures for one zone; `weekAgoAverage` is the same zone seven days before, when complete. */
export interface ZoneFuel {
	fuel: Fuel;
	minPrice: number;
	averagePrice: number;
	stations: number;
	weekAgoAverage: number | null;
}

export interface ZoneStats {
	updatedAt: string;
	weekAgo: string | null;
	fuels: ZoneFuel[];
}

/** What the board describes: the map's box, the search circle or one province. */
export type ZoneQuery =
	| { kind: 'box'; bounds: ViewBounds }
	| { kind: 'circle'; origin: Coordinates; radius: number }
	| { kind: 'province'; id: string };

/** A public charging site on the map: its most powerful connector and its charging points. */
export type ChargingPoint = [
	id: string,
	latitude: number,
	longitude: number,
	powerKw: number,
	points: number,
];

export interface ChargingSnapshot {
	updatedAt: string;
	sites: ChargingPoint[];
}

export interface ChargingConnector {
	type: string;
	current: 'AC' | 'DC';
	powerKw: number;
	count: number;
}

/** One charging site. The feed has no prices and no live availability. */
export interface ChargingSite {
	id: string;
	name: string | null;
	operator: string | null;
	address: string | null;
	town: string | null;
	province: string | null;
	postalCode: string | null;
	latitude: number;
	longitude: number;
	maxPowerKw: number | null;
	points: number;
	connectors: ChargingConnector[];
	payment: string[];
	schedule: string | null;
	openingHours: OpeningWeek | null;
	siteUpdatedAt: string | null;
	updatedAt: string;
}

export interface ChargingSummary {
	id: string;
	name: string | null;
	operator: string | null;
	town: string | null;
	openingHours: OpeningWeek | null;
}
