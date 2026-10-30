import { HttpInterceptorFn } from '@angular/common/http';
import { inject, InjectionToken, REQUEST } from '@angular/core';

export const API_ORIGIN = new InjectionToken<string>('API_ORIGIN');

/**
 * On the server, `/api` lives on the backend, not on this Node server. Angular may already have made a relative URL
 * absolute with the page's own origin (http://localhost:4000/api/...), so both forms go to the API; any other
 * origin is left alone.
 */
export const serverApiInterceptor: HttpInterceptorFn = (request, next) => {
	const api = inject(API_ORIGIN);
	const page = inject(REQUEST, { optional: true });
	const own = page ? new URL(page.url).origin : null;
	const target = new URL(request.url, own ?? 'http://relative.invalid');
	const ownServer = request.url.startsWith('/') || target.origin === own;
	return next(
		ownServer && target.pathname.startsWith('/api/')
			? request.clone({ url: `${api}${target.pathname}${target.search}` })
			: request,
	);
};
