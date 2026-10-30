import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FooterLinks } from './footer-links';

describe('FooterLinks', () => {
	it('links the catalogue provinces using their published names and slugs', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
		});
		const fixture = TestBed.createComponent(FooterLinks);
		const http = TestBed.inject(HttpTestingController);
		http.expectOne('/api/pages/provinces').flush([
			{ id: '01', name: 'Álava', slug: 'alava' },
			{ id: '15', name: 'A Coruña', slug: 'a-coruna' },
		]);
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('a[href="/gasolineras/alava"]').textContent).toBe(
			'Álava',
		);
		expect(fixture.nativeElement.querySelector('a[href="/gasolineras/a-coruna"]').textContent).toBe(
			'A Coruña',
		);
		expect(fixture.nativeElement.querySelector('a[href="/precio-diesel-hoy"]')).not.toBeNull();
		http.verify();
	});
});
