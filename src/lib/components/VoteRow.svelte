<script lang="ts">
	import type { VoteSummary, VoteType } from '$lib/models/types';
	import { abbreviateNumber } from '$lib/utils/format';
	import { budgetStore, type BudgetKind } from '$lib/stores/budget.svelte';

	interface Props {
		summary: VoteSummary;
		currentVote: VoteType | null;
		currentWeight: number; // how heavy did I vote already
		voting?: boolean;
		compact?: boolean;
		/** Which budget bucket to charge for extra weight when voting on this entity. */
		weightBudget: BudgetKind;
		oncast: (type: VoteType, weight: number) => void;
	}

	let {
		summary,
		currentVote,
		currentWeight,
		voting = false,
		compact = false,
		weightBudget,
		oncast
	}: Props = $props();

	function handle(type: VoteType, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		// Determine target weight based on current state:
		// - clicking same type increases weight (up to 3), or retracts at max
		// - clicking a different type sets weight back to 1
		let targetWeight = 1;
		if (currentVote === type) {
			if (currentWeight >= 3) targetWeight = 1; // rolls over to weight=1 rather than retract
			else targetWeight = currentWeight + 1;
			// The store treats "same type, same weight" as retract-toggle,
			// which is what we want when the user reaches the max and clicks again.
			if (targetWeight === currentWeight) targetWeight = 1;
		}

		// Extra weight (>1) needs budget. First vote is free.
		if (targetWeight > 1) {
			const extraNeeded = targetWeight - 1 - Math.max(0, currentWeight - 1);
			if (extraNeeded > 0 && !budgetStore.canAfford(weightBudget, extraNeeded)) {
				// Not enough budget: bail. Toast would be nicer, we go silent for now.
				return;
			}
			// Actually deduct the delta.
			for (let i = 0; i < extraNeeded; i++) budgetStore.spend(weightBudget);
		}

		oncast(type, targetWeight);
	}
</script>

<div class="vote-row" class:compact>
	<div class="vote-counts">
		<span class="vc support" title="{summary.support} weighted support"><span class="sign">+</span>{abbreviateNumber(summary.support)}</span>
		<span class="vc reject" title="{summary.reject} weighted reject"><span class="sign">−</span>{abbreviateNumber(summary.reject)}</span>
		<span class="vc neutral" title="{summary.neutral} weighted neutral"><span class="sign">~</span>{abbreviateNumber(summary.neutral)}</span>
	</div>

	<div class="vote-buttons">
		<button
			class="vb vb-support"
			class:active={currentVote === 'support'}
			data-weight={currentVote === 'support' ? currentWeight : 0}
			onclick={(e) => handle('support', e)}
			disabled={voting}
			title="Support (click again for weight up to 3)"
		>
			<span class="glyph">+</span>
			{#if currentVote === 'support' && currentWeight > 1}
				<span class="weight-badge">×{currentWeight}</span>
			{/if}
		</button>
		<button
			class="vb vb-reject"
			class:active={currentVote === 'reject'}
			data-weight={currentVote === 'reject' ? currentWeight : 0}
			onclick={(e) => handle('reject', e)}
			disabled={voting}
			title="Reject (click again for weight up to 3)"
		>
			<span class="glyph">−</span>
			{#if currentVote === 'reject' && currentWeight > 1}
				<span class="weight-badge">×{currentWeight}</span>
			{/if}
		</button>
		<button
			class="vb vb-neutral"
			class:active={currentVote === 'neutral'}
			onclick={(e) => handle('neutral', e)}
			disabled={voting}
			title="Neutral"
		>
			<span class="glyph">~</span>
		</button>
	</div>
</div>

<style>
	.vote-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.vote-counts {
		display: inline-flex;
		align-items: baseline;
		gap: 0.5rem;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	.vote-row.compact .vote-counts {
		font-size: var(--text-xs);
		gap: 0.375rem;
	}

	.vc {
		display: inline-flex;
		align-items: baseline;
		gap: 1px;
	}

	.vc .sign {
		font-weight: 600;
		opacity: 0.7;
	}

	.vc.support { color: var(--color-support); }
	.vc.reject  { color: var(--color-reject); }
	.vc.neutral { color: var(--color-neutral); }

	.vote-buttons {
		display: inline-flex;
		gap: 0.25rem;
	}

	.vb {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 30px;
		height: 26px;
		padding: 0 0.5rem;
		border-radius: var(--radius-sm);
		font-family: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		line-height: 1;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.vote-row.compact .vb {
		min-width: 26px;
		height: 22px;
		padding: 0 0.375rem;
		font-size: var(--text-xs);
	}

	.vb:hover:not(:disabled) {
		border-color: currentColor;
	}

	.vb:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.vb-support { color: var(--color-support); background: var(--color-support-bg); border-color: var(--color-support-border); }
	.vb-reject  { color: var(--color-reject);  background: var(--color-reject-bg);  border-color: var(--color-reject-border); }
	.vb-neutral { color: var(--color-neutral); background: var(--color-neutral-bg); border-color: var(--color-neutral-border); }

	.vb.active { color: white; }
	.vb.vb-support.active { background: var(--color-support); border-color: var(--color-support); }
	.vb.vb-reject.active  { background: var(--color-reject);  border-color: var(--color-reject); }
	.vb.vb-neutral.active { background: var(--color-neutral); border-color: var(--color-neutral); }

	.weight-badge {
		margin-left: 0.25rem;
		font-size: 0.65rem;
		font-family: var(--font-mono);
		opacity: 0.9;
	}

	.glyph {
		font-family: var(--font-mono);
	}
</style>
