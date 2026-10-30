import type { FeatureCollection } from 'geojson';
import type { LayerSpecification, SourceSpecification } from 'maplibre-gl';
import { bandOf, powerText } from './charging-functions';
import { distanceKm } from './place-functions';
import { decimal, quintileBreaks, quintileOf } from './price-format';
import { ChargingPoint, Coordinates, StationSnapshot } from './price-models';

/**
 * What the map draws over the base style, as plain data: the sources, the layers in their order, and the features of
 * the dots. The component only adds them to MapLibre and keeps them up to date.
 */
export interface MapTheme {
	dark: boolean;
	prices: readonly string[];
	power: readonly string[];
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** From this zoom (a neighbourhood) each dot carries its price or power as text. */
export const LABEL_ZOOM = 12;

// The overlays that come from IGN data (areas, the province outline) carry their own attribution control.
export const MAP_SOURCES: { id: string; source: SourceSpecification }[] = [
	{ id: 'circle-area', source: { type: 'geojson', data: EMPTY } },
	{ id: 'stations', source: { type: 'geojson', data: EMPTY } },
	{ id: 'charging', source: { type: 'geojson', data: EMPTY, attribution: '' } },
	{ id: 'areas', source: { type: 'geojson', data: EMPTY, attribution: '' } },
	{ id: 'focus-area', source: { type: 'geojson', data: EMPTY, attribution: '' } },
];

// Five classes, 0 to 4, as a MapLibre "match": the last colour is the fallback for class 4.
function byClass(property: string, colours: readonly string[]): unknown[] {
	return [
		'match',
		['get', property],
		0,
		colours[0],
		1,
		colours[1],
		2,
		colours[2],
		3,
		colours[3],
		colours[4],
	];
}

const ink = (theme: MapTheme) => (theme.dark ? '#ffffff' : '#0c0c0c');
const dotStroke = (theme: MapTheme) => (theme.dark ? '#0c0c0c' : 'rgba(0,0,0,0.6)');

/** Drawn under the base map's labels, so town and road names stay readable over the colours. */
export function underLabelLayers(theme: MapTheme): LayerSpecification[] {
	return [
		{
			id: 'area-fill',
			type: 'fill',
			source: 'areas',
			filter: ['>=', ['get', 'quintile'], 0],
			paint: { 'fill-opacity': 0.75, 'fill-color': byClass('quintile', theme.prices) },
		},
		{
			id: 'area-outline',
			type: 'line',
			source: 'areas',
			paint: {
				'line-width': 0.5,
				'line-color': theme.dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
			},
		},
		{
			id: 'focus-outline',
			type: 'line',
			source: 'focus-area',
			paint: { 'line-width': 2.5, 'line-color': ink(theme) },
		},
	] as LayerSpecification[];
}

/** Drawn over everything, in this order: the search circle, the dots, the selection rings and the circle's centre. */
export function topLayers(theme: MapTheme): LayerSpecification[] {
	return [
		{
			id: 'circle-fill',
			type: 'fill',
			source: 'circle-area',
			filter: ['==', '$type', 'Polygon'],
			paint: { 'fill-color': theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
		},
		{
			id: 'circle-outline',
			type: 'line',
			source: 'circle-area',
			filter: ['==', '$type', 'Polygon'],
			paint: {
				'line-color': theme.dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
				'line-width': 1.5,
			},
		},
		{
			id: 'stations',
			type: 'circle',
			source: 'stations',
			// The cheapest class is drawn on top and one pixel larger.
			layout: { 'circle-sort-key': ['-', 4, ['get', 'quintile']] },
			paint: {
				'circle-color': byClass('quintile', theme.prices),
				'circle-radius': [
					'interpolate',
					['linear'],
					['zoom'],
					6,
					['case', ['==', ['get', 'quintile'], 0], 4, 3],
					14,
					['case', ['==', ['get', 'quintile'], 0], 8, 7],
				],
				'circle-stroke-color': dotStroke(theme),
				'circle-stroke-width': 1,
				'circle-opacity': ['get', 'opacity'],
				'circle-stroke-opacity': ['get', 'opacity'],
			},
		},
		{
			id: 'charging-points',
			type: 'circle',
			source: 'charging',
			// The fastest classes are drawn on top.
			layout: { 'circle-sort-key': ['get', 'band'] },
			paint: {
				'circle-color': byClass('band', theme.power),
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 3, 14, 7],
				'circle-stroke-color': dotStroke(theme),
				'circle-stroke-width': 1,
			},
		},
		// At street level each dot also says its price or power in words: the colour is never the only clue
		// (WCAG 1.4.1), and it is what a driver compares there. Where two labels collide, the cheapest or the
		// fastest wins.
		dotLabel('station-labels', 'stations', ['get', 'quintile'], ['get', 'opacity']),
		dotLabel('charging-labels', 'charging', ['-', 4, ['get', 'band']], 1),
		selectionRing('selected-charging', 'charging', ''),
		selectionRing('selected-station', 'stations', -1),
		{
			id: 'circle-center',
			type: 'circle',
			source: 'circle-area',
			filter: ['==', '$type', 'Point'],
			paint: { 'circle-color': ink(theme), 'circle-radius': 6 },
		},
	] as LayerSpecification[];

	function dotLabel(id: string, source: string, priority: unknown, opacity: unknown): unknown {
		return {
			id,
			type: 'symbol',
			source,
			minzoom: LABEL_ZOOM,
			layout: {
				'text-field': ['get', 'label'],
				'text-font': ['Noto Sans Bold'],
				'text-size': 11,
				'text-anchor': 'top',
				'text-offset': [0, 0.9],
				'symbol-sort-key': priority,
			},
			paint: {
				'text-color': theme.dark ? '#ffffff' : '#111111',
				'text-halo-color': theme.dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)',
				'text-halo-width': 1.5,
				'text-opacity': opacity,
			},
		};
	}

	function selectionRing(id: string, source: string, none: string | number): unknown {
		return {
			id,
			type: 'circle',
			source,
			filter: ['==', ['get', 'id'], none],
			paint: {
				'circle-color': 'rgba(0,0,0,0)',
				'circle-radius': 10,
				'circle-stroke-color': ink(theme),
				'circle-stroke-width': 2,
			},
		};
	}
}

/** The fuel dots: the price class of each station, faded outside the search circle. */
export function stationFeatures(
	snapshot: StationSnapshot,
	origin: Coordinates | null,
	radiusKm: number,
): FeatureCollection {
	const breaks = quintileBreaks(snapshot.stations.map((point) => point[3]));
	return {
		type: 'FeatureCollection',
		features: snapshot.stations.map(([id, latitude, longitude, value]) => ({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [longitude, latitude] },
			properties: {
				id,
				price: value,
				label: decimal(value, 3),
				quintile: quintileOf(value, breaks),
				opacity: !origin || distanceKm(origin, { latitude, longitude }) <= radiusKm ? 1 : 0.25,
			},
		})),
	};
}

/** The charging dots: the power class of each site. */
export function chargingFeatures(sites: readonly ChargingPoint[]): FeatureCollection {
	return {
		type: 'FeatureCollection',
		features: sites.map(([id, latitude, longitude, powerKw]) => ({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [longitude, latitude] },
			properties: { id, band: bandOf(powerKw), label: powerText(powerKw) },
		})),
	};
}
