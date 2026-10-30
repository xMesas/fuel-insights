import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SignInPage } from './sign-in-page';

describe('SignInPage', () => {
	beforeEach(() => {
		localStorage.clear();
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
		});
	});
	afterEach(() => TestBed.inject(HttpTestingController).verify());
	async function send(status: number) {
		const fixture = TestBed.createComponent(SignInPage),
			http = TestBed.inject(HttpTestingController);
		await fixture.whenStable();
		http.expectOne('/api/me').flush(null, { status: 401, statusText: 'Unauthorized' });
		fixture.componentInstance.model.set({ email: 'ana@example.es' });
		fixture.componentInstance.send();
		const request = http.expectOne('/api/auth/link');
		expect(request.request.body.toString()).toBe('email=ana@example.es');
		request.flush(null, { status, statusText: String(status) });
		await fixture.whenStable();
		return fixture.nativeElement.textContent;
	}
	it('shows the expiry and spam advice after 202', async () => {
		expect(await send(202)).toContain(
			'Te hemos enviado un enlace a ana@example.es. Caduca en 15 minutos. Si no llega, mira en spam.',
		);
	});
	it('asks to review the email after 400', async () => {
		expect(await send(400)).toContain('Revisa el email.');
	});
	it('explains mail failure after 503', async () => {
		expect(await send(503)).toContain(
			'No hemos podido enviar el email. Inténtalo dentro de un rato.',
		);
	});
});
