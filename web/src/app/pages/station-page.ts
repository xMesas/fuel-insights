import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { StationPageData } from './page-models';
import { PageTools, ministryDate, stationId } from './page-tools';
import { decimal, effectiveDate, price } from '../price-format';
import { Seo } from '../seo';
import { FuelPreference } from '../fuel-preference';
import { PricesApi } from '../prices-api';
import { PriceTrend, StationDetail } from '../price-models';
import { TrendChart } from '../trend-chart';
import { googleDirections, openLabel, openState } from '../station-functions';
import { PRICE_CLOCK } from '../price-clock';
import { FavouriteStar } from '../favourite-star';

@Component({
	selector: 'app-station-page',
	imports: [RouterLink, TrendChart, FavouriteStar],
	providers: [PageTools],
	templateUrl: './station-page.html',
	styleUrl: './pages.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StationPage {
	private readonly http = inject(HttpClient);
	private readonly api = inject(PricesApi);
	private readonly tools = inject(PageTools);
	private readonly seo = inject(Seo);
	private readonly now = new Date(inject(PRICE_CLOCK).now());
	readonly preference = inject(FuelPreference);
	readonly data = signal<StationPageData | null>(null);
	readonly station = signal<StationDetail | null>(null);
	readonly status = signal('loading');
	readonly selected = computed(
		() =>
			this.station()?.prices.find((row) => row.fuel.code === this.preference.fuel()) ??
			this.station()?.prices[0],
	);
	readonly hours = computed(() =>
		openLabel(openState(this.station()?.openingHours, this.now), this.station()?.schedule ?? ''),
	);
	readonly directions = computed(() => (this.station() ? googleDirections(this.station()!) : ''));
	readonly history = computed(
		() =>
			this.station()
				?.history.find((row) => row.fuel === this.selected()?.fuel.code)
				?.points.toSorted((a, b) => a.date.localeCompare(b.date)) ?? [],
	);
	readonly trend = computed<PriceTrend | null>(() => {
		const rows = this.history(),
			selected = this.selected();
		if (!rows.length || !selected) return null;
		return {
			fuel: selected.fuel,
			area: { id: String(this.station()!.id), name: this.station()!.name },
			from: rows[0].date,
			to: rows.at(-1)!.date,
			points: rows.map((row) => ({
				date: row.date,
				averagePrice: row.price,
				medianPrice: null,
				movingAverage7: null,
				stations: 1,
			})),
		};
	});
	readonly price = price;
	readonly decimal = decimal;
	readonly effectiveDate = effectiveDate;
	readonly ministryDate = ministryDate;
	constructor() {
		inject(ActivatedRoute)
			.paramMap.pipe(
				switchMap((params) => {
					this.data.set(null);
					this.station.set(null);
					this.tools.clear();
					this.status.set('loading');
					const param = params.get('station') ?? '',
						id = stationId(param);
					const fail = (error: unknown) => {
						this.status.set(this.tools.error(error, `/gasolinera/${param}`));
						return of(null);
					};
					if (id === null) return fail(new HttpErrorResponse({ status: 404 }));
					return forkJoin({
						page: this.http.get<StationPageData>(`/api/pages/stations/${id}`),
						station: this.api.getStation(id),
					}).pipe(catchError(fail));
				}),
				takeUntilDestroyed(),
			)
			.subscribe((result) => {
				if (!result) return;
				const { page, station } = result;
				this.data.set(page);
				this.station.set(station);
				this.status.set('ready');
				const path = `/gasolinera/${page.slug}`,
					provincePath = `/gasolineras/${page.province.slug}`;
				const first = station.prices[0];
				this.seo.set(
					`${station.name} en ${page.town.name}: precio de la gasolina y el diésel | fuel-insights`,
					`${station.name}, ${station.address}, ${page.town.name}.${first ? ` ${first.fuel.shortName ?? first.fuel.name} a ${price(first.price, first.fuel.unit)}.` : ''} ${ministryDate(station.updatedAt)}.`,
					path,
				);
				this.tools.structured([
					{
						'@context': 'https://schema.org',
						'@type': 'GasStation',
						name: station.name,
						address: {
							'@type': 'PostalAddress',
							streetAddress: station.address,
							addressLocality: page.town.name,
							addressRegion: page.province.name,
							postalCode: station.postalCode,
							addressCountry: 'ES',
						},
						geo: {
							'@type': 'GeoCoordinates',
							latitude: station.latitude,
							longitude: station.longitude,
						},
						url: new URL(path, this.tools.origin).href,
					},
					this.tools.breadcrumbs([
						{ name: page.province.name, path: provincePath },
						{ name: page.town.name, path: `${provincePath}/${page.town.slug}` },
						{ name: station.name, path },
					]),
				]);
			});
	}
}
