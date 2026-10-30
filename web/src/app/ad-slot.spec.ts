import { TestBed } from '@angular/core/testing';
import { ADS_CLIENT, AdSlot } from './ad-slot';
import { Account } from './account';
import { signal } from '@angular/core';

describe('AdSlot', () => {
	const account = signal({ email: 'ana@example.es', premium: false, alertLimit: 3 });
	beforeEach(() => {
		account.set({ email: 'ana@example.es', premium: false, alertLimit: 3 });
		TestBed.configureTestingModule({ providers: [{ provide: Account, useValue: { account } }] });
	});
	it('removes the slot when the account becomes premium', async () => {
		TestBed.configureTestingModule({
			providers: [{ provide: ADS_CLIENT, useValue: 'ca-pub-test' }],
		});
		const fixture = TestBed.createComponent(AdSlot);
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('.ad')).not.toBeNull();
		account.update((value) => ({ ...value, premium: true }));
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('.ad')).toBeNull();
	});
	it('shows nothing until there is an AdSense client', () => {
		const fixture = TestBed.createComponent(AdSlot);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.ad')).toBeNull();
	});

	it('reserves the space of its format once there is a client', () => {
		TestBed.configureTestingModule({
			providers: [{ provide: ADS_CLIENT, useValue: 'ca-pub-test' }],
		});
		const fixture = TestBed.createComponent(AdSlot);
		fixture.componentRef.setInput('format', 'leaderboard');
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.ad.leaderboard')?.getAttribute('aria-label')).toBe(
			'Publicidad',
		);
	});
});
