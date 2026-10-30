import { signal } from '@angular/core';
import { Account } from './account';

export function signedOutAccount() {
	return {
		provide: Account,
		useValue: {
			account: signal(null),
			favourites: signal([]),
			favouritesReady: signal(false),
			pending: signal([]),
		},
	};
}
