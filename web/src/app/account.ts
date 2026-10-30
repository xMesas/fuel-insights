import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { afterNextRender, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { catchError, finalize, Observable, of, shareReplay, tap, throwError } from 'rxjs';

export interface AccountData {
	email: string;
	premium: boolean;
	alertLimit: number | null;
}

@Injectable({ providedIn: 'root' })
export class Account {
	private readonly http = inject(HttpClient);
	private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
	private request?: Observable<AccountData | null>;
	readonly account = signal<AccountData | null | undefined>(undefined);
	readonly favourites = signal<readonly { id: number }[]>([]);
	readonly favouritesReady = signal(false);
	readonly pending = signal<readonly number[]>([]);

	constructor() {
		afterNextRender(() => this.load().subscribe({ error: () => {} }));
	}

	load(): Observable<AccountData | null> {
		if (!this.browser) return of(null);
		return (this.request ??= this.http.get<AccountData>('/api/me').pipe(
			catchError((error) => (error.status === 401 ? of(null) : throwError(() => error))),
			tap((account) => {
				this.account.set(account);
				if (account) this.loadFavourites();
			}),
			shareReplay({ bufferSize: 1, refCount: false }),
		));
	}

	refresh(): Observable<AccountData | null> {
		this.request = undefined;
		return this.load();
	}

	signOut(): Observable<unknown> {
		return this.http.post('/api/auth/logout', null).pipe(tap(() => this.clearSession()));
	}

	clearSession(): void {
		this.account.set(null);
		this.favourites.set([]);
		this.favouritesReady.set(false);
		this.request = undefined;
	}

	private loadFavourites(): void {
		this.favouritesReady.set(false);
		this.http.get<{ id: number }[]>('/api/me/favourites').subscribe({
			next: (rows) => {
				this.favourites.set(rows);
				this.favouritesReady.set(true);
			},
			error: () => {},
		});
	}

	toggleFavourite(id: number): Observable<unknown> {
		if (!this.account() || !this.favouritesReady() || this.pending().includes(id)) return of(null);
		const saved = this.favourites().some((row) => row.id === id);
		const update = (keep: boolean) =>
			this.favourites.update((rows) =>
				keep
					? [...rows.filter((row) => row.id !== id), { id }]
					: rows.filter((row) => row.id !== id),
			);
		update(!saved);
		this.pending.update((ids) => [...ids, id]);
		return (
			saved
				? this.http.delete(`/api/me/favourites/${id}`)
				: this.http.put(`/api/me/favourites/${id}`, null)
		).pipe(
			catchError((error) => {
				update(saved);
				return throwError(() => error);
			}),
			finalize(() => this.pending.update((ids) => ids.filter((value) => value !== id))),
		);
	}
}
