import { RenderMode, ServerRoute } from '@angular/ssr';

// Public prices are rendered per request; account and email actions run only in the browser.
export const serverRoutes: ServerRoute[] = [
	{ path: 'mis-gasolineras', renderMode: RenderMode.Client },
	{ path: 'alertas/baja', renderMode: RenderMode.Client },
	{ path: 'entrar/confirmar', renderMode: RenderMode.Client },
	{ path: 'entrar', renderMode: RenderMode.Server },
	{ path: 'gasolinera/:station', renderMode: RenderMode.Server },
	{ path: 'gasolineras/:province/:town', renderMode: RenderMode.Server },
	{ path: 'gasolineras/:province', renderMode: RenderMode.Server },
	{ path: 'precio-diesel-hoy', renderMode: RenderMode.Server },
	{ path: 'precio-gasolina-hoy', renderMode: RenderMode.Server },
	{ path: '', renderMode: RenderMode.Server },
	{ path: 'estadisticas', renderMode: RenderMode.Server },
	{ path: 'aviso-legal', renderMode: RenderMode.Server },
	{ path: 'privacidad', renderMode: RenderMode.Server },
	{ path: 'cookies', renderMode: RenderMode.Server },
	{ path: '**', renderMode: RenderMode.Server, status: 404 },
];
