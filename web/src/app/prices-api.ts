import { AreaRow } from './area-functions';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, tap, throwError } from 'rxjs';
import {
	Area,
	ChargingSite,
	ChargingSnapshot,
	ChargingSummary,
	Place,
	CurrentStats,
	Fuel,
	GeocodeResult,
	PriceTrend,
	ProvinceStats,
	StationDetail,
	StationSnapshot,
	StationSummary,
	ZoneQuery,
	ZoneStats,
} from './price-models';
import { provinceTitleCase } from './price-format';
import { PRICE_CACHE_LIFETIME, PRICE_CLOCK } from './price-clock';

interface CacheEntry<T> {
	data: Observable<T>;
	fetchedAt: number | null;
}

@Injectable({ providedIn: 'root' })
export class PricesApi {
	private readonly http = inject(HttpClient);
	private readonly clock = inject(PRICE_CLOCK);
	private readonly stations = new Map<string, CacheEntry<StationSnapshot | null>>();
	private readonly municipalities = new Map<string, CacheEntry<AreaRow[]>>();
	getMunicipalities(fuel: string): Observable<AreaRow[]> {
		let entry = this.municipalities.get(fuel);
		if (!entry || this.expired(entry)) {
			const fresh: CacheEntry<AreaRow[]> = { data: of([]), fetchedAt: null };
			fresh.data = this.http.get<AreaRow[]>('/api/stats/municipalities', { params: { fuel } }).pipe(
				tap(() => {
					fresh.fetchedAt = this.clock.now();
				}),
				catchError((error) => {
					this.municipalities.delete(fuel);
					return throwError(() => error);
				}),
				shareReplay({ bufferSize: 1, refCount: false }),
			);
			this.municipalities.set(fuel, fresh);
			entry = fresh;
		}
		return entry.data;
	}
	private readonly details = new Map<number, CacheEntry<StationDetail>>();
	private readonly summaries = new Map<number, StationSummary | null>();
	private places?: Observable<Place[]>;

	getPlaces(): Observable<Place[]> {
		return (this.places ??= this.http
			.get<Place[]>('/api/places')
			.pipe(shareReplay({ bufferSize: 1, refCount: false })));
	}

	getStationSummaries(ids: readonly number[]): Observable<StationSummary[]> {
		const unique = [...new Set(ids)];
		const missing = unique.filter((id) => !this.summaries.has(id));
		const cached = () => unique.flatMap((id) => this.summaries.get(id) ?? []);
		if (!missing.length) return of(cached());
		return this.http
			.get<StationSummary[]>('/api/stations/summaries', { params: { ids: missing.join(',') } })
			.pipe(
				map((rows) => {
					for (const id of missing) this.summaries.set(id, null);
					for (const row of rows) this.summaries.set(row.id, row);
					return cached();
				}),
			);
	}

	getCurrent(): Observable<CurrentStats | null> {
		return this.http.get<CurrentStats>('/api/stats/current').pipe(catchError(this.missingSnapshot));
	}

	getStations(fuel: string): Observable<StationSnapshot | null> {
		let cached = this.stations.get(fuel);
		if (!cached || this.expired(cached)) {
			const entry: CacheEntry<StationSnapshot | null> = { data: of(null), fetchedAt: null };
			entry.data = this.http.get<StationSnapshot>('/api/stations', { params: { fuel } }).pipe(
				tap(() => {
					entry.fetchedAt = this.clock.now();
				}),
				catchError((error: unknown) => {
					this.stations.delete(fuel);
					return this.missingSnapshot(error);
				}),
				shareReplay({ bufferSize: 1, refCount: false }),
			);
			this.stations.set(fuel, entry);
			cached = entry;
		}
		return cached.data;
	}

	getStation(id: number): Observable<StationDetail> {
		let cached = this.details.get(id);
		if (!cached || this.expired(cached)) {
			const entry: CacheEntry<StationDetail> = { data: of(), fetchedAt: null };
			entry.data = this.http.get<StationDetail>(`/api/stations/${id}`).pipe(
				map((station) => ({ ...station, province: provinceTitleCase(station.province) })),
				tap(() => {
					entry.fetchedAt = this.clock.now();
				}),
				catchError((error: unknown) => {
					this.details.delete(id);
					return throwError(() => error);
				}),
				shareReplay({ bufferSize: 1, refCount: false }),
			);
			this.details.set(id, entry);
			cached = entry;
		}
		return cached.data;
	}

	private expired(entry: CacheEntry<unknown>): boolean {
		return entry.fetchedAt !== null && this.clock.now() - entry.fetchedAt >= PRICE_CACHE_LIFETIME;
	}

	private missingSnapshot(error: unknown): Observable<null> {
		return error instanceof HttpErrorResponse && error.status === 404
			? of(null)
			: throwError(() => error);
	}

	private charging?: Observable<ChargingSnapshot | null>;
	private readonly chargingSummaries = new Map<string, ChargingSummary | null>();

	// About 12,000 sites, refreshed once a day: loaded once, the first time the driver asks for them.
	getChargingSites(): Observable<ChargingSnapshot | null> {
		return (this.charging ??= this.http.get<ChargingSnapshot>('/api/charging/sites').pipe(
			catchError((error: unknown) => {
				this.charging = undefined;
				return this.missingSnapshot(error);
			}),
			shareReplay({ bufferSize: 1, refCount: false }),
		));
	}

	getChargingSite(id: string): Observable<ChargingSite> {
		return this.http.get<ChargingSite>(`/api/charging/sites/${encodeURIComponent(id)}`);
	}

	getChargingSummaries(ids: readonly string[]): Observable<ChargingSummary[]> {
		const unique = [...new Set(ids)];
		const missing = unique.filter((id) => !this.chargingSummaries.has(id));
		const cached = () => unique.flatMap((id) => this.chargingSummaries.get(id) ?? []);
		if (!missing.length) return of(cached());
		return this.http
			.get<ChargingSummary[]>('/api/charging/sites/summaries', {
				params: { ids: missing.join(',') },
			})
			.pipe(
				map((rows) => {
					for (const id of missing) this.chargingSummaries.set(id, null);
					for (const row of rows) this.chargingSummaries.set(row.id, row);
					return cached();
				}),
			);
	}

	getZone(query: ZoneQuery): Observable<ZoneStats | null> {
		const params: Record<string, string | number> =
			query.kind === 'province'
				? { province: query.id }
				: query.kind === 'circle'
					? {
							latitude: query.origin.latitude,
							longitude: query.origin.longitude,
							radius: query.radius,
						}
					: { ...query.bounds };
		return this.http
			.get<ZoneStats>('/api/stats/zone', { params })
			.pipe(catchError((error: unknown) => this.missingSnapshot(error)));
	}

	getFuels(): Observable<Fuel[]> {
		return this.http.get<Fuel[]>('/api/fuels');
	}

	geocode(q: string): Observable<GeocodeResult[]> {
		return this.http.get<GeocodeResult[]>('/api/geocode', { params: { q } });
	}

	geocodePoint(result: GeocodeResult): Observable<GeocodeResult> {
		return this.http.get<GeocodeResult>('/api/geocode/point', {
			params: { id: result.id, type: result.type },
		});
	}

	getAreas(): Observable<Area[]> {
		return this.http
			.get<Area[]>('/api/areas')
			.pipe(map((areas) => areas.map((area) => this.mapArea(area))));
	}

	getTrend(fuel: string, area: string, from?: string, to?: string): Observable<PriceTrend | null> {
		const params: Record<string, string> = { fuel, area };
		if (from) params['from'] = from;
		if (to) params['to'] = to;
		return this.http.get<PriceTrend>('/api/stats/trend', { params }).pipe(
			map((trend) => ({ ...trend, area: this.mapArea(trend.area) })),
			catchError((error: unknown) =>
				error instanceof HttpErrorResponse && error.status === 404
					? of(null)
					: throwError(() => error),
			),
		);
	}

	private mapArea(area: Area): Area {
		return { ...area, name: area.id === 'ES' ? 'España' : provinceTitleCase(area.name) };
	}

	getProvinces(fuel: string, date?: string): Observable<ProvinceStats | null> {
		const params: Record<string, string> = { fuel };
		if (date) params['date'] = date;
		return this.http.get<ProvinceStats>('/api/stats/provinces', { params }).pipe(
			map((stats) => ({
				...stats,
				provinces: stats.provinces.map((province) => ({
					...province,
					province: provinceTitleCase(province.province),
				})),
			})),
			catchError((error: unknown) =>
				error instanceof HttpErrorResponse && error.status === 404
					? of(null)
					: throwError(() => error),
			),
		);
	}
}
