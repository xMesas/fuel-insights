import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { FuelPageData } from './page-models';
import { PageTools, fullDate, ministryDate } from './page-tools';
import { CheapestTable, PageFigures } from './page-parts';
import { count, price } from '../price-format';
import { Seo } from '../seo';

@Component({
	selector: 'app-fuel-page',
	imports: [RouterLink, CheapestTable, PageFigures],
	providers: [PageTools],
	templateUrl: './fuel-page.html',
	styleUrl: './pages.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FuelPage {
	private readonly http = inject(HttpClient);
	private readonly tools = inject(PageTools);
	private readonly seo = inject(Seo);
	readonly data = signal<FuelPageData | null>(null);
	readonly status = signal('loading');
	readonly label = signal('');
	readonly path = signal('');
	readonly price = price;
	readonly count = count;
	readonly fullDate = fullDate;
	readonly ministryDate = ministryDate;
	constructor() {
		inject(ActivatedRoute)
			.data.pipe(
				switchMap((route) => {
					this.data.set(null);
					this.status.set('loading');
					const diesel = route['fuel'] === 'GASOLEO_A';
					this.label.set(diesel ? 'Precio del diésel' : 'Precio de la gasolina');
					this.path.set(diesel ? '/precio-diesel-hoy' : '/precio-gasolina-hoy');
					return this.http.get<FuelPageData>(`/api/pages/fuels/${route['fuel']}`).pipe(
						catchError((error) => {
							this.status.set(this.tools.error(error, this.path()));
							return of(null);
						}),
					);
				}),
				takeUntilDestroyed(),
			)
			.subscribe((data) => {
				if (!data) return;
				this.data.set(data);
				this.status.set('ready');
				this.seo.set(
					`${this.label()} hoy en España, ${fullDate(data.updatedAt)} | fuel-insights`,
					`${data.fuel.shortName ?? data.fuel.name} a ${price(data.national.averagePrice)} de media en España; la más barata, ${price(data.national.minPrice)}. ${ministryDate(data.updatedAt)}.`,
					this.path(),
				);
			});
	}
}
