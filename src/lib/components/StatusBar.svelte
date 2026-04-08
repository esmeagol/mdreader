<script lang="ts">
	import { document as doc } from '$lib/stores/document';
	import { formatWordCount } from '$lib/utils';
</script>

<footer data-testid="status-bar" class="status-bar">
	<span>{formatWordCount($doc.content)}</span>
</footer>
