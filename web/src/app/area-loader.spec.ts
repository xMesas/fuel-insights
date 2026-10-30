import { feature } from 'topojson-client';

vi.mock('es-atlas/es/municipalities.json', () => ({
	default: { objects: { municipalities: {} } },
}));
vi.mock('es-atlas/es/provinces.json', () => ({ default: { objects: { provinces: {} } } }));
vi.mock('topojson-client', () => ({
	feature: vi.fn(() => ({ type: 'FeatureCollection', features: [] })),
}));

describe('boundary loading', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});
	it('converts each lazily imported dataset once and reuses pending loads', async () => {
		const { loadBoundaries } = await import('./area-loader');
		expect(feature).not.toHaveBeenCalled();
		const first = loadBoundaries('municipalities');
		expect(loadBoundaries('municipalities')).toBe(first);
		await first;
		await loadBoundaries('municipalities');
		expect(feature).toHaveBeenCalledTimes(1);
		await loadBoundaries('provinces');
		expect(feature).toHaveBeenCalledTimes(2);
	});
	it('allows retrying a failed conversion', async () => {
		const { loadBoundaries } = await import('./area-loader');
		vi.mocked(feature).mockImplementationOnce(() => {
			throw new Error('Invalid topology');
		});
		await expect(loadBoundaries('municipalities')).rejects.toThrow('Invalid topology');
		await expect(loadBoundaries('municipalities')).resolves.toMatchObject({
			type: 'FeatureCollection',
		});
	});
});
