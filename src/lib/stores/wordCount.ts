import { writable } from 'svelte/store';

/** Updated by the WordCount PM plugin in EditorPane. */
export const wordCount = writable(0);
