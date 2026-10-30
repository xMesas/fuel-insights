import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { ɵHTTP_ROOT_INTERCEPTOR_FNS } from '@angular/common/http';
import { API_ORIGIN, serverApiInterceptor } from './server-api';
import { SITE_ORIGIN } from './seo';

const serverConfig: ApplicationConfig = {
	providers: [
		provideServerRendering(withRoutes(serverRoutes)),
		{
			provide: SITE_ORIGIN,
			useFactory: () => process.env['SITE_ORIGIN'] ?? 'http://localhost:4000',
		},
		{ provide: API_ORIGIN, useFactory: () => process.env['API_ORIGIN'] ?? 'http://localhost:8080' },
		// Run after Angular's transfer cache, which must see the same relative URL on both platforms.
		{ provide: ɵHTTP_ROOT_INTERCEPTOR_FNS, useValue: serverApiInterceptor, multi: true },
	],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
