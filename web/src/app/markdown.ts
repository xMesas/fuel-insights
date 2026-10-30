/**
 * The small part of Markdown the legal texts use: headings, paragraphs, lists, tables, bold, inline code and links.
 * The texts live once in `docs/legal/*.md`; this turns them into HTML at build time. Everything is escaped first, so
 * the only tags in the result are the ones made here.
 */
export function markdownToHtml(markdown: string): string {
	const html: string[] = [];
	const lines = markdown.replace(/\r\n/g, '\n').split('\n');
	let paragraph: string[] = [];
	let list: string[] = [];
	let table: string[][] = [];

	const flush = () => {
		if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
		if (list.length)
			html.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
		if (table.length) html.push(tableHtml(table));
		paragraph = [];
		list = [];
		table = [];
	};

	for (const raw of lines) {
		const line = raw.trim();
		const heading = /^(#{1,4})\s+(.*)$/.exec(line);
		if (!line) {
			flush();
		} else if (heading) {
			flush();
			const level = heading[1].length + 1; // the page already has its h1
			html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
		} else if (/^[-*]\s+/.test(line)) {
			if (paragraph.length || table.length) flush();
			list.push(line.replace(/^[-*]\s+/, ''));
		} else if (line.startsWith('|')) {
			if (paragraph.length || list.length) flush();
			const cells = line
				.slice(1, line.endsWith('|') ? -1 : undefined)
				.split('|')
				.map((cell) => cell.trim());
			if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) table.push(cells);
		} else if (list.length) {
			list[list.length - 1] += ' ' + line;
		} else {
			paragraph.push(line);
		}
	}
	flush();
	return html.join('\n');
}

function tableHtml(rows: string[][]): string {
	const [head, ...body] = rows;
	const th = head.map((cell) => `<th scope="col">${inline(cell)}</th>`).join('');
	const tr = body
		.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
		.join('');
	return `<div class="table-scroll"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

function inline(text: string): string {
	return escape(text)
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, (_, label: string, href: string) =>
			href.startsWith('/')
				? `<a href="${href}">${label}</a>`
				: `<a href="${href}" rel="noopener">${label}</a>`,
		);
}

function escape(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
