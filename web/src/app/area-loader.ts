import { Injectable } from '@angular/core';
import type { FeatureCollection } from 'geojson';
const cache = new Map<string, Promise<FeatureCollection>>();
export function loadBoundaries(view: 'municipalities' | 'provinces'): Promise<FeatureCollection> {
	if (typeof window === 'undefined')
		return Promise.resolve({ type: 'FeatureCollection', features: [] });
	let pending = cache.get(view);
	if (!pending) {
		pending = Promise.all([
			view === 'municipalities'
				? import('es-atlas/es/municipalities.json')
				: import('es-atlas/es/provinces.json'),
			import('topojson-client'),
		])
			.then(
				([atlas, topo]) =>
					new Promise<FeatureCollection>((resolve, reject) => {
						const convert = () => {
							try {
								resolve(
									topo.feature(
										atlas.default,
										(atlas.default.objects as Record<string, unknown>)[view],
									) as FeatureCollection,
								);
							} catch (error) {
								reject(error);
							}
						};
						if ('requestIdleCallback' in window)
							window.requestIdleCallback(convert, { timeout: 1000 });
						else setTimeout(convert, 0);
					}),
			)
			.catch((error) => {
				cache.delete(view);
				throw error;
			});
		cache.set(view, pending);
	}
	return pending;
}

/** Injectable, so tests can swap the 1.8 MB boundaries for a tiny fixture through TestBed. */
@Injectable({ providedIn: 'root' })
export class BoundaryLoader {
	load(view: 'municipalities' | 'provinces'): Promise<FeatureCollection> {
		return loadBoundaries(view);
	}
}
