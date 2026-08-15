<script lang="ts">
	import type { ComplexitySettings } from '$lib/models/types';
	import { FIB_THESES, FIB_ARGUMENTS, FIB_RELATED } from '$lib/models/fibonacci';

	let { onchange }: { onchange: (settings: ComplexitySettings) => void } = $props();

	// The slider walks discrete Fibonacci steps. One index drives all three
	// dimensions in lockstep; shorter ladders clamp to their last value so the
	// steps stay aligned. Default lands on step 2 (theses 8 · args 3 · related 8).
	const STEP_COUNT = FIB_THESES.length; // 7 steps: 3,5,8,13,21,34,55
	let step = $state(2);

	function pick(ladder: readonly number[], i: number): number {
		return ladder[Math.min(i, ladder.length - 1)];
	}

	let settings = $derived<ComplexitySettings>({
		max_theses: pick(FIB_THESES, step),
		max_arguments: pick(FIB_ARGUMENTS, step),
		max_related: pick(FIB_RELATED, step)
	});

	$effect(() => {
		onchange(settings);
	});

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		step = parseInt(target.value, 10);
	}
</script>

<div class="slider-container">
	<div class="slider-row">
		<span class="slider-label">Simple</span>
		<input
			type="range"
			min="0"
			max={STEP_COUNT - 1}
			step="1"
			value={step}
			oninput={handleInput}
			list="fib-marks"
		/>
		<datalist id="fib-marks">
			{#each FIB_THESES as _, i}
				<option value={i}></option>
			{/each}
		</datalist>
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
