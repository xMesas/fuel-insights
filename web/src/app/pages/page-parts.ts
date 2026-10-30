import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Figures, StationRow } from './page-models';
import { count, effectiveDate, price } from '../price-format';

@Component({
	selector: 'app-page-figures',
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<dl class="figures">
			<div>
				<dt>Precio medio</dt>
				<dd>{{ price(data().averagePrice, unit()) }}</dd>
			</div>
			<div>
				<dt>Más barata</dt>
				<dd>{{ price(data().minPrice, unit()) }}</dd>
			</div>
			<div>
				<dt>Más cara</dt>
				<dd>{{ price(data().maxPrice, unit()) }}</dd>
			</div>
			<div>
				<dt>Gasolineras</dt>
				<dd>{{ count(data().stations) }}</dd>
			</div>
		</dl>
		@if (data().latestDay; as day) {
			<p>
				Último día publicado, {{ effectiveDate(day.date) }}:
				{{ price(day.averagePrice, unit()) }} de media.
			</p>
		}
		@if (data().highestDay; as day) {
			<p>
				Máximo diario del periodo cargado, {{ effectiveDate(day.date) }}:
				{{ price(day.averagePrice, unit()) }} de media.
			</p>
		}
	`,
	styles: `
		.figures {
			display: flex;
			flex-wrap: wrap;
			gap: 24px;
		}
		dt {
			color: var(--ink-2);
		}
		dd {
			margin: 8px 0;
			font-size: 24px;
			font-variant-numeric: tabular-nums;
		}
	`,
})
export class PageFigures {
	readonly data = input.required<Figures>();
	readonly unit = input('l');
	readonly price = price;
	readonly count = count;
	readonly effectiveDate = effectiveDate;
}

@Component({
	selector: 'app-cheapest-table',
	imports: [RouterLink],
	styleUrl: './pages.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<div class="table-scroll" tabindex="0" role="region" [attr.aria-label]="caption()">
			<table>
				<caption>
					{{
						caption()
					}}
				</caption>
				<thead>
					<tr>
						<th scope="col">Gasolinera</th>
						<th scope="col">Municipio</th>
						<th scope="col">Precio</th>
					</tr>
				</thead>
				<tbody>
					@for (row of rows(); track row.id) {
						<tr>
							<th scope="row">
								<a [routerLink]="['/gasolinera', row.slug]">{{ row.name }}</a>
							</th>
							<td>
								<a [routerLink]="['/gasolineras', row.provinceSlug, row.townSlug]">{{
									row.town
								}}</a>
							</td>
							<td class="num">{{ price(row.price, unit()) }}</td>
						</tr>
					}
				</tbody>
			</table>
		</div>
	`,
})
export class CheapestTable {
	readonly rows = input.required<StationRow[]>();
	readonly unit = input('l');
	readonly caption = input('Las 10 gasolineras más baratas');
	readonly price = price;
}
