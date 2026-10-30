import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Account } from './account';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FooterLinks } from './footer-links';

/** The frame of every page: each route renders inside it. */
@Component({
	selector: 'app-root',
	imports: [RouterLink, RouterLinkActive, RouterOutlet, FooterLinks],
	templateUrl: './app.html',
	styleUrl: './app.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
	readonly account = inject(Account);
}
