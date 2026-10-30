import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { UnsubscribePage } from './unsubscribe-page';

describe('UnsubscribePage', () => {
	beforeEach(() =>
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{
					provide: ActivatedRoute,
					useValue: {
						snapshot: { queryParamMap: convertToParamMap({ alerta: '7', firma: 'signed+value' }) },
					},
				},
			],
		}),
	);
	afterEach(() => TestBed.inject(HttpTestingController).verify());
	it('does not unsubscribe when the email link is opened', async () => {
		const fixture = TestBed.createComponent(UnsubscribePage);
		await fixture.whenStable();
		TestBed.inject(HttpTestingController).expectNone(() => true);
	});
	it('confirms unsubscribe after the button is clicked', async () => {
		const fixture = TestBed.createComponent(UnsubscribePage);
		await fixture.whenStable();
		fixture.nativeElement.querySelector('button').click();
		const request = TestBed.inject(HttpTestingController).expectOne(
			(req) => req.url === '/api/alerts/unsubscribe',
		);
		expect(request.request.method).toBe('POST');
		expect(request.request.params.get('signature')).toBe('signed+value');
		request.flush(null, { status: 204, statusText: 'No Content' });
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain('Listo: no recibirás más esta alerta.');
	});
	it('explains an invalid signature after 404', async () => {
		const fixture = TestBed.createComponent(UnsubscribePage);
		await fixture.whenStable();
		fixture.nativeElement.querySelector('button').click();
		TestBed.inject(HttpTestingController)
			.expectOne((req) => req.url === '/api/alerts/unsubscribe')
			.flush(null, { status: 404, statusText: 'Not Found' });
		await fixture.whenStable();
		expect(fixture.nativeElement.textContent).toContain('Este enlace no es válido.');
	});
});
