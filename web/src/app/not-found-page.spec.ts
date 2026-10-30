import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NotFoundPage } from './not-found-page';

describe('NotFoundPage', () => {
	beforeEach(() =>
		TestBed.configureTestingModule({
			providers: [provideRouter([{ path: '**', component: NotFoundPage }])],
		}),
	);
	it('offers a link back to the map', async () => {
		const harness = await RouterTestingHarness.create('/no-existe');
		expect(harness.routeNativeElement?.querySelector('a')?.getAttribute('href')).toBe('/');
	});
	it('sets the missing page title', async () => {
		await RouterTestingHarness.create('/no-existe');
		expect(TestBed.inject(Title).getTitle()).toBe('Página no encontrada | fuel-insights');
	});
	it('excludes missing pages from indexing', async () => {
		await RouterTestingHarness.create('/no-existe');
		expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe('noindex');
	});
});
