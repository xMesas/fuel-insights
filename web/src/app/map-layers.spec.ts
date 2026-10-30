import {
	chargingFeatures,
	MAP_SOURCES,
	LABEL_ZOOM,
	MapTheme,
	stationFeatures,
	topLayers,
	underLabelLayers,
} from './map-layers';
import { chargingPoints } from './charging-fixture';
import { liveSnapshot } from './live-fixture';

const dark: MapTheme = {
	dark: true,
	prices: ['#p0', '#p1', '#p2', '#p3', '#p4'],
	power: ['#w0', '#w1', '#w2', '#w3', '#w4'],
};

describe('map layers', () => {
	it('has a source for every layer', () => {
		const sources = MAP_SOURCES.map((entry) => entry.id);
		for (const layer of [...underLabelLayers(dark), ...topLayers(dark)])
			expect(sources).toContain((layer as { source: string }).source);
	});

	it('draws the selection rings and the circle centre over the dots', () => {
		expect(topLayers(dark).map((layer) => layer.id)).toEqual([
			'circle-fill',
			'circle-outline',
			'stations',
			'charging-points',
			'station-labels',
			'charging-labels',
			'selected-charging',
			'selected-station',
			'circle-center',
		]);
	});

	it('keeps the town and province fills under the base map labels', () => {
		expect(underLabelLayers(dark).map((layer) => layer.id)).toEqual([
			'area-fill',
			'area-outline',
			'focus-outline',
		]);
	});

	it('colours prices and power by their own scales and outlines dots for the style', () => {
		const stations = topLayers(dark).find((layer) => layer.id === 'stations') as any;
		const charging = topLayers(dark).find((layer) => layer.id === 'charging-points') as any;
		expect(stations.paint['circle-color']).toEqual([
			'match',
			['get', 'quintile'],
			0,
			'#p0',
			1,
			'#p1',
			2,
			'#p2',
			3,
			'#p3',
			'#p4',
		]);
		expect(charging.paint['circle-color']).toContain('#w4');
		expect(stations.paint['circle-stroke-color']).toBe('#0c0c0c');
		const light = topLayers({ ...dark, dark: false }).find(
			(layer) => layer.id === 'stations',
		) as any;
		expect(light.paint['circle-stroke-color']).toBe('rgba(0,0,0,0.6)');
	});

	it('fades the stations outside the search circle', () => {
		const origin = {
			latitude: liveSnapshot.stations[0][1],
			longitude: liveSnapshot.stations[0][2],
		};
		const features = stationFeatures(liveSnapshot, origin, 1).features;
		expect(features[0].properties!['opacity']).toBe(1);
		expect(features.some((feature) => feature.properties!['opacity'] === 0.25)).toBe(true);
		expect(
			stationFeatures(liveSnapshot, null, 1).features.every((f) => f.properties!['opacity'] === 1),
		).toBe(true);
	});

	it('gives each charging site the class of its power', () => {
		expect(chargingFeatures(chargingPoints).features.map((feature) => feature.properties)).toEqual([
			{ id: 'SLOW', band: 0, label: '3,7 kW' },
			{ id: 'SEMI', band: 1, label: '22 kW' },
			{ id: 'FAST', band: 2, label: '50 kW' },
			{ id: 'RAPID', band: 3, label: '150 kW' },
			{ id: 'ULTRA', band: 4, label: '350 kW' },
		]);
	});

	it('labels each dot with its price or power from street zoom, the cheapest winning a collision', () => {
		const labels = topLayers(dark).find((layer) => layer.id === 'station-labels') as any;
		expect(labels.minzoom).toBe(LABEL_ZOOM);
		expect(labels.layout['text-field']).toEqual(['get', 'label']);
		expect(labels.layout['symbol-sort-key']).toEqual(['get', 'quintile']);
		expect(stationFeatures(liveSnapshot, null, 1).features[0].properties!['label']).toMatch(
			/^\d,\d{3}$/,
		);
	});
});
