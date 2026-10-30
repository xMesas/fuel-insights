import { HttpClient, provideHttpClient, ɵHTTP_ROOT_INTERCEPTOR_FNS } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, REQUEST, TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideClientHydration } from '@angular/platform-browser';
import { API_ORIGIN, serverApiInterceptor } from './server-api';

describe('server API interceptor', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: API_ORIGIN, useValue: 'http://backend:8080' },
				{ provide: ɵHTTP_ROOT_INTERCEPTOR_FNS, useValue: serverApiInterceptor, multi: true },
			],
		});
	});
	afterEach(() => TestBed.inject(HttpTestingController).verify());

	it('rewrites relative API requests and keeps their parameters', () => {
		TestBed.inject(HttpClient)
			.get('/api/stations', { params: { fuel: 'GASOLEO_A' } })
			.subscribe();
		TestBed.inject(HttpTestingController)
			.expectOne('http://backend:8080/api/stations?fuel=GASOLEO_A')
			.flush([]);
	});
	it('sends absolute requests to the page server itself to the API', () => {
		TestBed.resetTestingModule();
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: API_ORIGIN, useValue: 'http://backend:8080' },
				{ provide: REQUEST, useValue: new Request('http://localhost:4000/gasolineras/barcelona') },
				{ provide: ɵHTTP_ROOT_INTERCEPTOR_FNS, useValue: serverApiInterceptor, multi: true },
			],
		});
		TestBed.inject(HttpClient).get('http://localhost:4000/api/areas').subscribe();
		TestBed.inject(HttpTestingController).expectOne('http://backend:8080/api/areas').flush([]);
	});
	it('keeps absolute requests unchanged', () => {
		TestBed.inject(HttpClient).get('https://example.org/api/data').subscribe();
		TestBed.inject(HttpTestingController).expectOne('https://example.org/api/data').flush([]);
	});
	it('keeps other relative requests unchanged', () => {
		TestBed.inject(HttpClient).get('/assets/data.json').subscribe();
		TestBed.inject(HttpTestingController).expectOne('/assets/data.json').flush([]);
	});
	it('reuses the server response for the browser relative URL', () => {
		TestBed.resetTestingModule();
		vi.stubGlobal('ngServerMode', true);
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideClientHydration(),
				provideHttpClientTesting(),
				{ provide: PLATFORM_ID, useValue: 'server' },
				{ provide: API_ORIGIN, useValue: 'http://backend:8080' },
				{ provide: ɵHTTP_ROOT_INTERCEPTOR_FNS, useValue: serverApiInterceptor, multi: true },
			],
		});
		TestBed.inject(HttpClient).get('/api/fuels').subscribe();
		TestBed.inject(HttpTestingController)
			.expectOne('http://backend:8080/api/fuels')
			.flush(['diesel']);
		const state = TestBed.inject(TransferState);
		TestBed.resetTestingModule();
		vi.stubGlobal('ngServerMode', false);
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideClientHydration(),
				provideHttpClientTesting(),
				{ provide: TransferState, useValue: state },
			],
		});
		let result: unknown;
		TestBed.inject(HttpClient)
			.get('/api/fuels')
			.subscribe((value) => (result = value));
		expect(result).toEqual(['diesel']);
		TestBed.inject(HttpTestingController).expectNone('/api/fuels');
		vi.unstubAllGlobals();
	});
});
