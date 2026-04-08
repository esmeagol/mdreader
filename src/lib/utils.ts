export function formatWordCount(text: string): string {
	const count = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
	return count === 1 ? '1 word' : `${count} words`;
}
