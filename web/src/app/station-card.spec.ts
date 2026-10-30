import { TestBed } from '@angular/core/testing';
import { signedOutAccount } from './account-fixture';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { StationCard } from './station-card';
import { PricesApi } from './prices-api';
import { liveFuels, liveStation } from './live-fixture';
import { PRICE_CLOCK } from './price-clock';
import { shareText, siteLink, STATION_PARAM } from './station-functions';

describe('StationCard', () => {
	it('shows kilogram prices without the litre fill up estimate', async () => {
		const fixture = await create();
		const fuel = { code: 'GNC', name: 'Gas natural comprimido', unit: 'kg', main: false };
		fixture.componentRef.setInput('selectedFuel', 'GNC');
		fixture.componentRef.setInput('fuels', [...liveFuels, fuel]);
		fixture.componentRef.setInput('station', {
			...liveStation(),
			prices: [{ fuel, price: 1.958 }],
			history: [],
		});
		fixture.componentInstance.detailsOpen.set(true);
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain('1,958 €/kg');
		expect(fixture.nativeElement.textContent).not.toContain('Lleno');
		expect(fixture.nativeElement.textContent).toContain('Aún sin historial para este carburante.');
	});
	beforeEach(() =>
		TestBed.configureTestingModule({
			providers: [
				signedOutAccount(),
				provideRouter([]),
				{ provide: PRICE_CLOCK, useValue: { now: () => Date.parse('2026-10-29T14:00:00Z') } },
				{
					provide: PricesApi,
					useValue: {
						getStationSummaries: () =>
							of([{ id: 9001, name: 'PETROPRIX', municipality: 'Abengibre', openingHours: null }]),
					},
				},
			],
		}),
	);
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});
	async function create() {
		const fixture = TestBed.createComponent(StationCard);
		fixture.componentRef.setInput('station', liveStation());
		fixture.componentRef.setInput('fuels', liveFuels);
		fixture.componentRef.setInput('zone', ZONE);
		fixture.componentInstance.detailsOpen.set(false);
		await fixture.whenStable();
		return fixture;
	}
	it('links to the station page', async () => {
		const fixture = await create();
		expect(fixture.nativeElement.querySelector('a[href="/gasolinera/4375"]').textContent).toBe(
			'Ver ficha',
		);
	});
	// The station (1,829) is the cheapest of three; their average is 1,870.
	const ZONE = {
		label: 'a menos de 10 km',
		rows: [
			{
				point: [4375, 39.211417, -1.539167, 1.829] as [number, number, number, number],
				distanceKm: 0,
			},
			{ point: [9001, 39.22, -1.539167, 1.849] as [number, number, number, number], distanceKm: 1 },
			{ point: [9002, 39.25, -1.539167, 1.931] as [number, number, number, number], distanceKm: 4 },
		],
	};
	it('shows the ranking status and price first and keeps the rest behind the information button', async () => {
		const fixture = await create();
		const page: HTMLElement = fixture.nativeElement;
		expect(page.querySelector('.pill')?.textContent?.trim()).toBe('1.ª más barata');
		expect(page.textContent).toContain('de 3 a menos de 10 km');
		expect(page.textContent).toContain('Abierta · cierra a las 22:00');
		expect(page.querySelector('.selected-price')?.textContent).toContain('1,829 €/l');
		expect(page.querySelector('.selected-price .eu-label')?.textContent).toBe('B7');
		expect(page.textContent).not.toContain('media de la zona');
		expect(document.activeElement?.id).toBe('station-title');
	});
	it('opens the details with what you pay, the next station and the zone average', async () => {
		const fixture = await create();
		const page: HTMLElement = fixture.nativeElement;
		page.querySelector<HTMLButtonElement>('[aria-label="Más información"]')!.click();
		await fixture.whenStable();
		expect(page.textContent).toContain(
			'Con 20 €: 10,9 l. Te ahorras 0,44 € frente a la media de la zona.',
		);
		expect(page.textContent).toContain('Siguiente más barata:');
		expect(page.textContent).toContain('PETROPRIX');
		expect(page.textContent).toContain('4,1 céntimos menos que la media de la zona');
		expect(page.querySelector('.coordinates')?.textContent?.trim()).toBe('39,21142, -1,53917');
	});
	it('answers a full tank when it is chosen', async () => {
		const fixture = await create();
		fixture.componentInstance.detailsOpen.set(true);
		fixture.componentInstance.amountLabel.set('Lleno');
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain('Lleno (50 l): 91,45 €. Te ahorras 2,03 €');
	});
	it('opens the next station from the details', async () => {
		const fixture = await create();
		const open = vi.fn();
		fixture.componentInstance.openStation.subscribe(open);
		fixture.componentInstance.detailsOpen.set(true);
		await fixture.whenStable();
		fixture.nativeElement.querySelector('.link').click();
		expect(open).toHaveBeenCalledWith([9001, 39.22, -1.539167, 1.849]);
	});
	it('lists only the fuels the station sells', async () => {
		const fixture = await create();
		expect(fixture.nativeElement.textContent).not.toContain('Sin precio');
	});
	it('has no ranking nor zone figures without a zone', async () => {
		const fixture = await create();
		fixture.componentRef.setInput('zone', null);
		fixture.componentInstance.detailsOpen.set(true);
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('.pill')).toBeNull();
		expect(fixture.nativeElement.textContent).not.toContain('media de la zona');
		expect(fixture.nativeElement.textContent).toContain('Con 20 €: 10,9 l.');
	});
	it('discloses three links and closes the disclosure before closing the card on Escape', async () => {
		const fixture = await create();
		const close = vi.fn();
		fixture.componentInstance.close.subscribe(close);
		const button: HTMLButtonElement = fixture.nativeElement.querySelector('.primary');
		button.click();
		await fixture.whenStable();
		expect(button.getAttribute('aria-expanded')).toBe('true');
		const links = fixture.nativeElement.querySelectorAll('#directions-links a');
		expect(links).toHaveLength(3);
		for (const link of links) {
			expect(link.target).toBe('_blank');
			expect(link.rel).toBe('noopener');
		}
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		await fixture.whenStable();
		expect(close).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(button);
		expect(button.getAttribute('aria-expanded')).toBe('false');
		button.click();
		await fixture.whenStable();
		document.body.click();
		await fixture.whenStable();
		expect(button.getAttribute('aria-expanded')).toBe('false');
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(close).toHaveBeenCalledOnce();
	});
	it('shares the selected price and ignores a cancelled native share', async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'share', { value: share, configurable: true });
		try {
			const fixture = await create();
			await fixture.componentInstance.share();
			expect(share).toHaveBeenCalledWith({
				title: liveStation().name,
				text: shareText(liveStation(), 'Gasóleo A', 1.829),
				url: siteLink(STATION_PARAM, liveStation().id),
			});
			share.mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
			await fixture.componentInstance.share();
			expect(fixture.componentInstance.shareStatus()).toBe('');
		} finally {
			Reflect.deleteProperty(navigator, 'share');
		}
	});
	it('copies text and a place link and announces Copiado for two seconds', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
		Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
		try {
			const fixture = await create();
			vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
			await fixture.componentInstance.share();
			await fixture.whenStable();
			expect(writeText).toHaveBeenCalledWith(
				`${shareText(liveStation(), 'Gasóleo A', 1.829)}\n${siteLink(STATION_PARAM, liveStation().id)}`,
			);
			expect(fixture.nativeElement.querySelector('.share-status').textContent).toBe('Copiado');
			vi.advanceTimersByTime(2000);
			expect(fixture.componentInstance.shareStatus()).toBe('');
		} finally {
			if (original) Object.defineProperty(navigator, 'clipboard', original);
			else Reflect.deleteProperty(navigator, 'clipboard');
		}
	});
	it('keeps missing calendar days as gaps in the sparkline', async () => {
		const fixture = TestBed.createComponent(StationCard);
		fixture.componentInstance.detailsOpen.set(true);
		fixture.componentRef.setInput('fuels', liveFuels);
		fixture.componentRef.setInput('station', {
			...liveStation(),
			history: [
				{
					fuel: 'GASOLEO_A',
					points: [
						{ date: '2026-10-25', price: 1.8 },
						{ date: '2026-10-26', price: 1.82 },
						{ date: '2026-10-28', price: 1.829 },
					],
				},
			],
		});
		await fixture.whenStable();
		expect(fixture.componentInstance.segments()).toHaveLength(2);
		expect(fixture.nativeElement.querySelectorAll('dl div')).toHaveLength(
			liveStation().prices.length - 1,
		);
		expect(fixture.nativeElement.textContent).not.toContain('Sin precio');
		expect(fixture.nativeElement.querySelector('svg title').textContent).toContain(
			'28 oct 2026: 1,829 €/l',
		);
	});
});
