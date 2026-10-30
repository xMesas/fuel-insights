import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { LegalPage, splitTitle } from './legal-page';

describe('LegalPage', () => {
	function create(document: string) {
		TestBed.configureTestingModule({
			providers: [
				provideRouter([]),
				{ provide: ActivatedRoute, useValue: { snapshot: { data: { document } } } },
			],
		});
		const fixture = TestBed.createComponent(LegalPage);
		fixture.detectChanges();
		return fixture.nativeElement as HTMLElement;
	}

	it('takes the page title from the first heading of the text', () => {
		const page = create('aviso-legal');
		expect(page.querySelector('h1')?.textContent).toBe('Aviso legal');
		expect(page.querySelectorAll('h1')).toHaveLength(1);
	});

	it('shows the privacy table with its header cells', () => {
		const page = create('privacidad');
		expect(page.querySelectorAll('th[scope="col"]').length).toBeGreaterThan(2);
	});

	it('names its own address as canonical', () => {
		create('cookies');
		expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toMatch(
			/\/cookies$/,
		);
	});

	it('splits the first heading from the body', () => {
		expect(splitTitle('# Cookies\n\nTexto.')).toEqual({ title: 'Cookies', body: '\nTexto.' });
	});
});
