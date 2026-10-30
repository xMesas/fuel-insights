import { Routes } from '@angular/router';
import { NotFoundPage } from './not-found-page';

export const routes: Routes = [
	{
		path: 'mis-gasolineras',
		loadComponent: () => import('./my-stations-page').then((m) => m.MyStationsPage),
	},
	{
		path: 'alertas/baja',
		loadComponent: () => import('./unsubscribe-page').then((m) => m.UnsubscribePage),
	},
	{
		path: 'entrar/confirmar',
		loadComponent: () => import('./confirm-sign-in-page').then((m) => m.ConfirmSignInPage),
	},
	{ path: 'entrar', loadComponent: () => import('./sign-in-page').then((m) => m.SignInPage) },
	{
		path: 'gasolinera/:station',
		loadComponent: () => import('./pages/station-page').then((m) => m.StationPage),
	},
	{
		path: 'gasolineras/:province/:town',
		loadComponent: () => import('./pages/town-page').then((m) => m.TownPage),
	},
	{
		path: 'gasolineras/:province',
		loadComponent: () => import('./pages/province-page').then((m) => m.ProvincePage),
	},
	{
		path: 'precio-diesel-hoy',
		data: { fuel: 'GASOLEO_A' },
		loadComponent: () => import('./pages/fuel-page').then((m) => m.FuelPage),
	},
	{
		path: 'precio-gasolina-hoy',
		data: { fuel: 'GASOLINA_95_E5' },
		loadComponent: () => import('./pages/fuel-page').then((m) => m.FuelPage),
	},
	{ path: '', loadComponent: () => import('./map-page').then((m) => m.MapPage) },
	{ path: 'estadisticas', loadComponent: () => import('./stats-page').then((m) => m.StatsPage) },
	{
		path: 'aviso-legal',
		data: { document: 'aviso-legal' },
		loadComponent: () => import('./legal-page').then((m) => m.LegalPage),
	},
	{
		path: 'privacidad',
		data: { document: 'privacidad' },
		loadComponent: () => import('./legal-page').then((m) => m.LegalPage),
	},
	{
		path: 'cookies',
		data: { document: 'cookies' },
		loadComponent: () => import('./legal-page').then((m) => m.LegalPage),
	},
	{ path: '**', component: NotFoundPage },
];
