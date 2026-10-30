import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { ConfirmSignInPage } from './confirm-sign-in-page';
import { signInPath } from './sign-in-path';

describe('ConfirmSignInPage', () => {
	beforeEach(() => {
		localStorage.clear();
	});
	afterEach(() => TestBed.inject(HttpTestingController).verify());
	async function create(back = '/gasolinera/7') {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				provideRouter([]),
				{
					provide: ActivatedRoute,
					useValue: {
						snapshot: { queryParamMap: convertToParamMap({ token: 'link-token', volver: back }) },
					},
				},
			],
		});
		const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
		const fixture = TestBed.createComponent(ConfirmSignInPage);
		await fixture.whenStable();
		TestBed.inject(HttpTestingController)
			.expectOne('/api/me')
			.flush(null, { status: 401, statusText: 'Unauthorized' });
		return { fixture, navigate, http: TestBed.inject(HttpTestingController) };
	}
	it('never posts the token on load', async () => {
		const { http } = await create();
		http.expectNone('/api/auth/login');
	});
	it.each(['/gasolinera/7', '//evil.example', 'https://evil.example', '/\\evil.example'])(
		'follows only a safe destination after a click: %s',
		async (back) => {
			const { fixture, navigate, http } = await create(back);
			fixture.nativeElement.querySelector('button').click();
			const request = http.expectOne('/api/auth/login');
			expect(request.request.body.toString()).toBe('token=link-token');
			request.flush(null, { status: 204, statusText: 'No Content' });
			http.expectOne('/api/me').flush({ email: 'ana@example.es', premium: false, alertLimit: 3 });
			http.expectOne('/api/me/favourites').flush([]);
			expect(navigate).toHaveBeenCalledWith(signInPath(back) ?? '/mis-gasolineras');
		},
	);
	it('explains an expired or used link', async () => {
		const { fixture, http } = await create();
		fixture.nativeElement.querySelector('button').click();
		http.expectOne('/api/auth/login').flush(null, { status: 401, statusText: 'Unauthorized' });
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain('El enlace ha caducado o ya se usó.');
	});
});
