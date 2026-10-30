import { TestBed } from '@angular/core/testing';
import { LedNotice, ledText } from './led-notice';

describe('LedNotice', () => {
	afterEach(() => vi.useRealTimers());

	it('writes what a 14-segment panel can draw', () => {
		expect(ledText('No pudimos ver tu ubicación.')).toBe('NO PUDIMOS VER TU UBICACION.');
		expect(ledText('Señal: 1,8 km')).toBe('SENAL: 1,8 KM');
	});

	it('keeps the real text for screen readers and hides the moving letters', async () => {
		const fixture = TestBed.createComponent(LedNotice);
		fixture.componentRef.setInput('message', 'No pudimos ver tu ubicación.');
		await fixture.whenStable();
		const page: HTMLElement = fixture.nativeElement;
		expect(page.querySelector('[role=status] .visually-hidden')?.textContent).toBe(
			'No pudimos ver tu ubicación.',
		);
		expect(page.querySelector('.window')?.getAttribute('aria-hidden')).toBe('true');
	});

	it('closes with its button', async () => {
		const fixture = TestBed.createComponent(LedNotice);
		fixture.componentRef.setInput('message', 'Aviso');
		await fixture.whenStable();
		const dismissed = vi.fn();
		fixture.componentInstance.dismissed.subscribe(dismissed);
		fixture.nativeElement.querySelector('button').click();
		expect(dismissed).toHaveBeenCalledOnce();
	});

	it('stays until it is closed, however long reading takes', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const fixture = TestBed.createComponent(LedNotice);
		const dismissed = vi.fn();
		fixture.componentInstance.dismissed.subscribe(dismissed);
		fixture.componentRef.setInput('message', 'Aviso');
		fixture.detectChanges();
		vi.advanceTimersByTime(10 * 60_000);
		expect(dismissed).not.toHaveBeenCalled();
		vi.useRealTimers();
	});
});
