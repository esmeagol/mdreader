import { writable } from 'svelte/store';
import type { Heading } from '$lib/outline';

/** Updated by the Headings PM plugin in EditorPane. */
export const headings = writable<Heading[]>([]);
