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

// Tauri's asset protocol handler strips the leading "/" from the URL path and then
// percent-decodes the remainder. To recover an absolute filesystem path we must
// encodeURIComponent the WHOLE path (including its leading "/") as a single token:
//   /docs/notes/img.png → %2Fdocs%2Fnotes%2Fimg.png
//   URL: asset://localhost/%2Fdocs%2Fnotes%2Fimg.png
//   Handler: strip "/", decode → /docs/notes/img.png  ✓
// This is identical to what Tauri's own convertFileSrc() does.

/** Rewrite relative image src attributes to asset:// URLs for Tauri rendering. */
export function resolveImages(markdown: string, filePath: string): string {
	const dir = fileDir(filePath);
	return markdown.replace(IMAGE_RE, (match, alt, src) => {
		if (/^(https?|asset|data):/.test(src) || src.startsWith('/')) return match;
		return `![${alt}](asset://localhost/${encodeURIComponent(`${dir}/${src}`)})`;
	});
}

/** Reverse resolveImages — restore relative paths before saving to disk. */
export function unresolveImages(markdown: string, filePath: string): string {
	const dir = fileDir(filePath);
	const assetPrefix = 'asset://localhost/';
	return markdown.replace(IMAGE_RE, (match, alt, src) => {
		if (!src.startsWith(assetPrefix)) return match;
		const decoded = decodeURIComponent(src.slice(assetPrefix.length));
		if (!decoded.startsWith(`${dir}/`)) return match;
		return `![${alt}](${decoded.slice(dir.length + 1)})`;
	});
}
