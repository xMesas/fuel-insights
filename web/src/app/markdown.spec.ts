import { markdownToHtml } from './markdown';

describe('markdownToHtml', () => {
	it('turns headings into the levels below the page title', () => {
		expect(markdownToHtml('# Aviso legal\n\n## Titular')).toBe(
			'<h2>Aviso legal</h2>\n<h3>Titular</h3>',
		);
	});

	it('joins the lines of a paragraph and of a list item', () => {
		expect(markdownToHtml('Una\nfrase.\n\n- uno\n  sigue\n- dos')).toBe(
			'<p>Una frase.</p>\n<ul><li>uno sigue</li><li>dos</li></ul>',
		);
	});

	it('writes tables with header cells and without the separator row', () => {
		expect(markdownToHtml('| Dato | Plazo |\n| --- | --- |\n| IP | [N] días |')).toBe(
			'<div class="table-scroll"><table><thead><tr><th scope="col">Dato</th><th scope="col">Plazo</th>' +
				'</tr></thead><tbody><tr><td>IP</td><td>[N] días</td></tr></tbody></table></div>',
		);
	});

	it('keeps placeholders in brackets and links only real addresses', () => {
		expect(
			markdownToHtml(
				'**Titular:** [NOMBRE]. Ver [la AEPD](https://www.aepd.es/) y [privacidad](/privacidad).',
			),
		).toBe(
			'<p><strong>Titular:</strong> [NOMBRE]. Ver <a href="https://www.aepd.es/" rel="noopener">la AEPD</a>' +
				' y <a href="/privacidad">privacidad</a>.</p>',
		);
	});

	it('escapes any markup in the text', () => {
		expect(markdownToHtml('<script>alert(1)</script> [x](javascript:alert(1))')).toBe(
			'<p>&lt;script&gt;alert(1)&lt;/script&gt; [x](javascript:alert(1))</p>',
		);
	});
});
