export interface Heading {
	level: number;
	text: string;
	slug: string;
}

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-');
}

export function extractHeadings(markdown: string): Heading[] {
	const headings: Heading[] = [];
	let inCodeBlock = false;

	for (const line of markdown.split('\n')) {
		if (line.startsWith('```')) {
			inCodeBlock = !inCodeBlock;
			continue;
		}
		if (inCodeBlock) continue;

		const match = line.match(/^(#{1,3})\s+(.+)/);
		if (match) {
			const text = match[2].trim();
			headings.push({ level: match[1].length, text, slug: slugify(text) });
		}
	}

	return headings;
}
