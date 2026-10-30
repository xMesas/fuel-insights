import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Account } from './account';

describe('Account', () => {
	it('clears the cached account after account deletion', () => {
		const account = TestBed.inject(Account);
		const http = TestBed.inject(HttpTestingController);
		account.load().subscribe();
		http.expectOne('/api/me').flush({ email: 'ana@example.es', premium: false, alertLimit: 3 });
		http.expectOne('/api/me/favourites').flush([{ id: 7 }]);
		account.clearSession();
		account.load().subscribe();
		http.expectOne('/api/me').flush(null, { status: 401, statusText: 'Unauthorized' });
		expect(account.account()).toBeNull();
		expect(account.favourites()).toEqual([]);
	});
	it('clears the session and favourites after signing out', () => {
		const account = TestBed.inject(Account),
			http = TestBed.inject(HttpTestingController);
		account.load().subscribe();
		http.expectOne('/api/me').flush({ email: 'ana@example.es', premium: false, alertLimit: 3 });
		http.expectOne('/api/me/favourites').flush([{ id: 7 }]);
		account.signOut().subscribe();
		http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
		expect(account.account()).toBeNull();
		expect(account.favourites()).toEqual([]);
	});
	beforeEach(() =>
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		}),
	);
	afterEach(() => TestBed.inject(HttpTestingController).verify());
	it('never loads the account on the server', () => {
		TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
		const account = TestBed.inject(Account);
		account.load().subscribe();
		TestBed.tick();
		TestBed.inject(HttpTestingController).expectNone('/api/me');
		expect(account.account()).toBeUndefined();
	});
	it('loads once after the first render', () => {
		const account = TestBed.inject(Account),
			http = TestBed.inject(HttpTestingController);
		http.expectNone('/api/me');
		TestBed.tick();
		http.expectOne('/api/me').flush(null, { status: 401, statusText: 'Unauthorized' });
		account.load().subscribe();
		http.expectNone('/api/me');
		expect(account.account()).toBeNull();
	});
	it('rolls back a favourite when saving fails', () => {
		const account = TestBed.inject(Account),
			http = TestBed.inject(HttpTestingController);
		account.load().subscribe();
		http.expectOne('/api/me').flush({ email: 'ana@example.es', premium: false, alertLimit: 3 });
		http.expectOne('/api/me/favourites').flush([]);
		account.toggleFavourite(7).subscribe({ error: () => {} });
		expect(account.favourites()).toEqual([{ id: 7 }]);
		http.expectOne('/api/me/favourites/7').flush(null, { status: 503, statusText: 'Unavailable' });
		expect(account.favourites()).toEqual([]);
		expect(account.pending()).toEqual([]);
	});
});
