<script lang="ts">
	import type { ComplexitySettings } from '$lib/models/types';
	import { complexityBoundsStore } from '$lib/stores/complexity-bounds.svelte';

	let { onchange }: { onchange: (settings: ComplexitySettings) => void } = $props();

	let complexity = $state(30);

	let settings = $derived<ComplexitySettings>({
		max_theses: Math.round(
			complexityBoundsStore.min.max_theses +
				(complexity / 100) *
					(complexityBoundsStore.max.max_theses - complexityBoundsStore.min.max_theses)
		),
		max_arguments: Math.round(
			complexityBoundsStore.min.max_arguments +
				(complexity / 100) *
					(complexityBoundsStore.max.max_arguments - complexityBoundsStore.min.max_arguments)
		),
		max_related: Math.round(
			complexityBoundsStore.min.max_related +
				(complexity / 100) *
					(complexityBoundsStore.max.max_related - complexityBoundsStore.min.max_related)
		)
	});

	$effect(() => {
		onchange(settings);
	});

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		complexity = parseInt(target.value, 10);
	}
</script>

<div class="slider-container">
	<div class="slider-row">
		<span class="slider-label">Simple</span>
		<input type="range" min="0" max="100" value={complexity} oninput={handleInput} />
		<span class="slider-label">Complex</span>
	</div>
	<span class="slider-value">{settings.max_theses} theses · {settings.max_arguments} args · {settings.max_related} related</span>
</div>

<style>
	.slider-container {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.slider-row {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.slider-row input[type='range'] {
		flex: 1;
		min-width: 0;
	}

	.slider-label {
		font-size: var(--text-xs);
		color: var(--color-text-light);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.slider-value {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		font-family: var(--font-mono);
		text-align: center;
	}
</style>
