import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { FavouriteStar } from './favourite-star';
import { signedOutAccount } from './account-fixture';

describe('FavouriteStar', () => {
	it('links signed out visitors to sign in with their current path', async () => {
		TestBed.configureTestingModule({ providers: [provideRouter([]), signedOutAccount()] });
		vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/?gasolinera=7');
		const fixture = TestBed.createComponent(FavouriteStar);
		fixture.componentRef.setInput('stationId', 7);
		await fixture.whenStable();
		const link = fixture.nativeElement.querySelector('a');
		expect(link.textContent).toContain('Guardar');
		expect(link.getAttribute('href')).toBe('/entrar?volver=%2F%3Fgasolinera%3D7');
	});
});
