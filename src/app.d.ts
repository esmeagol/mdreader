// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {}
}

declare module '/src/lib/stores/document.ts' {
	export const document: {
		load(content: string, filePath: string | null): void;
	};
}

export {};
