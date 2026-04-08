export function formatWordCount(text: string): string {
	const count = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
	return count === 1 ? '1 word' : `${count} words`;
}

export function formatTitle(filePath: string | null, isDirty: boolean): string {
	const base = filePath ? filePath.split('/').pop()! : 'Untitled';
	return isDirty ? `• ${base} — mdreader` : `${base} — mdreader`;
}
