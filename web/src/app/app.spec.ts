import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';

@Component({ template: '' })
class EmptyPage {}

describe('App navigation', () => {
	it('switches the account tab after signing in', async () => {
		const fixture = TestBed.createComponent(App);
		await fixture.whenStable();
		const link = () => fixture.nativeElement.querySelector('.account-tab');
		expect(link().textContent.trim()).toBe('Entrar');
		TestBed.inject(HttpTestingController)
			.expectOne('/api/me')
			.flush({ email: 'ana@example.es', premium: false, alertLimit: 3 });
		TestBed.inject(HttpTestingController).expectOne('/api/me/favourites').flush([]);
		await fixture.whenStable();
		expect(link().textContent.trim()).toBe('Mis gasolineras');
		expect(link().getAttribute('href')).toBe('/mis-gasolineras');
	});
	beforeEach(() =>
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				provideRouter([
					{ path: '', component: EmptyPage },
					{ path: 'estadisticas', component: EmptyPage },
				]),
			],
		}),
	);
	afterEach(() => {
		const http = TestBed.inject(HttpTestingController);
		http.match('/api/pages/provinces').forEach((request) => request.flush([]));
		http
			.match('/api/me')
			.forEach((request) => request.flush(null, { status: 401, statusText: 'Unauthorized' }));
		http.verify();
	});

	it('marks the map link as the current page', async () => {
		const fixture = TestBed.createComponent(App);
		await TestBed.inject(Router).navigateByUrl('/');
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('nav [aria-current="page"]').textContent).toBe(
			'Mapa',
		);
	});

	it('marks only statistics as current after navigating', async () => {
		const fixture = TestBed.createComponent(App);
		await TestBed.inject(Router).navigateByUrl('/estadisticas');
		await fixture.whenStable();
		const current = fixture.nativeElement.querySelectorAll('nav [aria-current="page"]');
		expect([...current].map((link: any) => link.textContent)).toEqual(['Estadísticas']);
	});

	it('keeps the map current for a station deep link', async () => {
		const fixture = TestBed.createComponent(App);
		await TestBed.inject(Router).navigateByUrl('/?gasolinera=4375');
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('nav [aria-current="page"]').textContent).toBe(
			'Mapa',
		);
	});

	it('keeps the source licences in the shell', async () => {
		const fixture = TestBed.createComponent(App);
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('footer').textContent).toContain('CC BY 4.0');
	});
});
