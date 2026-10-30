import { decimal, effectiveDate, price } from './price-format';
import { BrandStats, SpreadStats, WeekdayStats } from './statistics-models';

export const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function weekdayConclusion(data: WeekdayStats): string {
	const rows = data.weekdays
		.filter((row) => row.days > 0)
		.toSorted((a, b) => a.deviation - b.deviation);
	if (!rows.length) return '';
	const first = rows[0];
	const last = rows[rows.length - 1];
	const gap = (last.deviation - first.deviation) * 100;
	const period = `Del ${effectiveDate(data.from)} al ${effectiveDate(data.to)}`;
	if (gap < 0.000001)
		return `${period}, no hubo diferencias entre los días con datos para ${data.fuel.name}.`;
	return `${period}, el ${WEEKDAYS[first.weekday - 1]} fue el día más barato para repostar ${data.fuel.name} y el ${WEEKDAYS[last.weekday - 1]} el más caro${gap < 1 ? ', pero la diferencia es pequeña' : ''}: ${decimal(gap, 1)} céntimos por litro.`;
}

export function spreadConclusion(data: SpreadStats): string {
	if (!data.spain.stations) return '';
	const gap = data.spain.dearPrice - data.spain.cheapPrice;
	return `En España, elegir una de las gasolineras baratas en vez de una de las caras ahorra ${decimal(gap * 100, 1)} céntimos por litro: ${decimal(gap * 50, 2)} € en un depósito de 50 litros.`;
}

export function brandConclusion(data: BrandStats): string {
	const rows = data.brands.toSorted((a, b) => a.averagePrice - b.averagePrice);
	if (!rows.length) return '';
	const first = rows[0];
	const last = rows[rows.length - 1];
	if (rows.length === 1)
		return `${first.name} es la única marca con al menos 50 gasolineras (${price(first.averagePrice, data.fuel.unit)} de media).`;
	if (first.averagePrice === last.averagePrice)
		return `Las marcas con al menos 50 gasolineras tienen la misma media (${price(first.averagePrice, data.fuel.unit)}).`;
	return `${first.name} es la marca más barata de media (${price(first.averagePrice, data.fuel.unit)}) y ${last.name} la más cara (${price(last.averagePrice, data.fuel.unit)}).`;
}
