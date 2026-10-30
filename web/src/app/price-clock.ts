import { InjectionToken } from '@angular/core';

export const PRICE_CACHE_LIFETIME = 5 * 60_000;

export const PRICE_CLOCK = new InjectionToken<{ now(): number }>('Price clock', {
	providedIn: 'root',
	factory: () => ({ now: () => Date.now() }),
});
