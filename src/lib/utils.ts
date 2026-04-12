export function countWords(text: string): number {
	return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

export function formatWordCount(count: number): string {
	return count === 1 ? '1 word' : `${count} words`;
}

/** Basename for UI (toolbar/status) and window title — `Untitled` when no path. */
export function documentDisplayName(filePath: string | null): string {
	if (!filePath?.trim()) return 'Untitled';
	const normalized = filePath.replace(/\\/g, '/');
	const parts = normalized.split('/').filter(Boolean);
	const base = parts[parts.length - 1];
	return base && base.length > 0 ? base : 'Untitled';
}

export function formatTitle(filePath: string | null, isDirty: boolean): string {
	const base = documentDisplayName(filePath);
	return isDirty ? `• ${base} — mdreader` : `${base} — mdreader`;
}

