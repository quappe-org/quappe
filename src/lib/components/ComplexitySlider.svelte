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
	<span class="slider-label">Simple</span>
	<input type="range" min="0" max="100" value={complexity} oninput={handleInput} />
	<span class="slider-label">Complex</span>
	<span class="slider-value">{settings.max_theses}T / {settings.max_arguments}A</span>
</div>

<style>
	.slider-container {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 200px;
	}

	.slider-value {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		white-space: nowrap;
		font-family: var(--font-mono);
		min-width: 4.5rem;
	}

	input[type='range'] {
		flex: 1;
		min-width: 80px;
	}
</style>
