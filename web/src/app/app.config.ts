import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideClientHydration, withNoIncrementalHydration } from '@angular/platform-browser';
import {
	provideRouter,
	withEnabledBlockingInitialNavigation,
	withInMemoryScrolling,
} from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		// Blocking: the first page is fully routed before the app counts as stable, which hydration expects.
		provideRouter(
			routes,
			withEnabledBlockingInitialNavigation(),
			withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
		),
		provideHttpClient(withFetch()),
		// No incremental hydration (on by default): its event replay inlines scripts that the CSP blocks (nginx allows
		// only 'self'), and the site uses no `hydrate on` triggers.
		provideClientHydration(withNoIncrementalHydration()),
	],
};
