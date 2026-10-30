import { isPlatformBrowser } from '@angular/common';
import { afterNextRender, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FuelPreference {
	private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
	private readonly value = signal('GASOLEO_A');
	readonly fuel = this.value.asReadonly();

	constructor() {
		if (!this.browser) return;
		afterNextRender(() => {
			try {
				this.value.set(localStorage.getItem('fuel-insights-fuel') ?? 'GASOLEO_A');
			} catch {}
		});
	}

	choose(code: string): void {
		this.value.set(code);
		if (!this.browser) return;
		try {
			localStorage.setItem('fuel-insights-fuel', code);
		} catch {}
	}
}
