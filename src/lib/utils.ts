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

function fileDir(filePath: string): string {
	return filePath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
}

const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

/** Rewrite relative image src attributes to asset:// URLs for Tauri rendering. */
export function resolveImages(markdown: string, filePath: string): string {
	const dir = fileDir(filePath);
	return markdown.replace(IMAGE_RE, (match, alt, src) => {
		if (/^(https?|asset|data):/.test(src) || src.startsWith('/')) return match;
		return `![${alt}](asset://localhost${dir}/${src})`;
	});
}

/** Reverse resolveImages — restore relative paths before saving to disk. */
export function unresolveImages(markdown: string, filePath: string): string {
	const prefix = `asset://localhost${fileDir(filePath)}/`;
	return markdown.replace(IMAGE_RE, (match, alt, src) => {
		if (!src.startsWith(prefix)) return match;
		return `![${alt}](${src.slice(prefix.length)})`;
	});
}
