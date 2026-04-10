<script lang="ts">
	interface Props {
		showReplace: boolean;
		onQuery: (q: string) => void;
		onReplace: (r: string) => void;
		onNext: () => void;
		onPrev: () => void;
		onReplaceOne: () => void;
		onReplaceAll: () => void;
		onClose: () => void;
	}

	let {
		showReplace,
		onQuery,
		onReplace,
		onNext,
		onPrev,
		onReplaceOne,
		onReplaceAll,
		onClose
	}: Props = $props();

	let query = $state('');
	let replacement = $state('');
</script>

<div data-testid="find-bar" class="find-bar">
	<div class="find-row">
		<input
			data-testid="find-input"
			class="find-input"
			bind:value={query}
			oninput={() => onQuery(query)}
			placeholder="Find…"
		/>
		<button class="nav-btn" onclick={onPrev} title="Previous match">↑</button>
		<button class="nav-btn" onclick={onNext} title="Next match">↓</button>
		<button class="close-btn" onclick={onClose} title="Close">✕</button>
	</div>

	{#if showReplace}
		<div class="replace-row">
			<input
				data-testid="replace-input"
				class="find-input"
				bind:value={replacement}
				oninput={() => onReplace(replacement)}
				placeholder="Replace…"
			/>
			<button class="nav-btn" onclick={onReplaceOne}>Replace</button>
			<button class="nav-btn" onclick={onReplaceAll}>All</button>
		</div>
	{/if}
</div>

<style>
	.find-bar {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--color-bg);
		border-bottom: 1px solid var(--color-border);
		padding: 6px 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.find-row,
	.replace-row {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.find-input {
		flex: 1;
		font-size: 13px;
		padding: 3px 6px;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		background: var(--color-bg);
		color: var(--color-text);
		outline: none;
	}
	.find-input:focus {
		border-color: var(--color-text-muted);
	}

	.nav-btn {
		font-size: 12px;
		padding: 3px 7px;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		background: var(--color-bg-sidebar);
		color: var(--color-text);
		cursor: pointer;
		white-space: nowrap;
	}
	.nav-btn:hover {
		background: var(--color-border);
	}

	.close-btn {
		font-size: 12px;
		padding: 3px 7px;
		border: none;
		background: none;
		color: var(--color-text-muted);
		cursor: pointer;
		border-radius: 4px;
	}
	.close-btn:hover {
		background: var(--color-border);
	}
</style>
