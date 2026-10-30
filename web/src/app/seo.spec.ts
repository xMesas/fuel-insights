import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { Seo, SITE_ORIGIN } from './seo';

describe('Seo', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [{ provide: SITE_ORIGIN, useValue: 'https://fuel.example' }],
		});
	});
	it('sets the page title', () => {
		TestBed.inject(Seo).set('Statistics', 'Prices', '/estadisticas');
		expect(TestBed.inject(Title).getTitle()).toBe('Statistics');
	});
	it('sets the description', () => {
		TestBed.inject(Seo).set('Statistics', 'Prices', '/estadisticas');
		expect(TestBed.inject(Meta).getTag('name="description"')?.content).toBe('Prices');
	});
	it('reuses a single canonical with the configured origin', () => {
		const seo = TestBed.inject(Seo);
		seo.set('Map', 'Prices', '/');
		seo.set('Statistics', 'Prices', '/estadisticas');
		const links = document.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]');
		expect([...links].map((link) => link.href)).toEqual(['https://fuel.example/estadisticas']);
	});
	it('sets the Open Graph tags', () => {
		TestBed.inject(Seo).set('Statistics', 'Prices', '/estadisticas');
		const meta = TestBed.inject(Meta);
		expect(
			['title', 'description', 'url'].map((key) => meta.getTag(`property="og:${key}"`)?.content),
		).toEqual(['Statistics', 'Prices', 'https://fuel.example/estadisticas']);
	});
	it('removes noindex when returning to a public page', () => {
		const seo = TestBed.inject(Seo);
		seo.set('Missing', 'Missing', '/missing', true);
		seo.set('Map', 'Prices', '/');
		expect(TestBed.inject(Meta).getTag('name="robots"')).toBeNull();
	});
});
