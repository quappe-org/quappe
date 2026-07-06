<script lang="ts">
	import type { VoteSummary, VoteType } from '$lib/models/types';
	import { abbreviateNumber } from '$lib/utils/format';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		summary: VoteSummary;
		currentVote: VoteType | null;
		currentWeight: number; // how heavy did I vote already
		voting?: boolean;
		compact?: boolean;
		showButtons?: boolean;
		oncast?: (type: VoteType, weight: number) => void;
	}

	let {
		summary,
		currentVote,
		currentWeight,
		voting = false,
		compact = false,
		showButtons = true,
		oncast
	}: Props = $props();

	function handle(type: VoteType, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		let targetWeight = 1;
		if (currentVote === type) {
			if (currentWeight >= 3) targetWeight = 1;
			else targetWeight = currentWeight + 1;
			if (targetWeight === currentWeight) targetWeight = 1;
		}

		oncast?.(type, targetWeight);
	}
</script>

<div class="vote-row" class:compact>
	<div class="vote-counts">
		<span class="vc support" title="{summary.support} weighted support"><span class="sign">+</span>{abbreviateNumber(summary.support)}</span>
		<span class="vc reject" title="{summary.reject} weighted reject"><span class="sign">−</span>{abbreviateNumber(summary.reject)}</span>
		<span class="vc neutral" title="{summary.neutral} weighted neutral"><span class="sign">~</span>{abbreviateNumber(summary.neutral)}</span>
	</div>

	{#if showButtons}
	<div class="vote-buttons">
		<button
			class="vb vb-support"
			class:active={currentVote === 'support'}
			data-weight={currentVote === 'support' ? currentWeight : 0}
			onclick={(e) => handle('support', e)}
			disabled={voting}
			title={m.vote_support_hint()}
		>
			<span class="glyph">+</span>
			{#if !compact}<span class="vb-label">{m.vote_support()}</span>{/if}
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
			title={m.vote_reject_hint()}
		>
			<span class="glyph">−</span>
			{#if !compact}<span class="vb-label">{m.vote_reject()}</span>{/if}
			{#if currentVote === 'reject' && currentWeight > 1}
				<span class="weight-badge">×{currentWeight}</span>
			{/if}
		</button>
		<button
			class="vb vb-neutral"
			class:active={currentVote === 'neutral'}
			onclick={(e) => handle('neutral', e)}
			disabled={voting}
			title={m.vote_neutral_hint()}
		>
			<span class="glyph">~</span>
			{#if !compact}<span class="vb-label">{m.vote_neutral()}</span>{/if}
		</button>
	</div>
	{/if}
</div>

<style>
	.vote-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
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
		gap: 0.375rem;
	}

	.vb {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		min-width: 52px;
		height: 40px;
		padding: 0 0.9rem;
		border-radius: var(--radius-sm);
		font-family: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		line-height: 1;
		border: 1.5px solid;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.vote-row.compact .vb {
		min-width: 44px;
		height: 34px;
		padding: 0 0.65rem;
		font-size: var(--text-sm);
		gap: 0.3rem;
		border-width: 1.5px;
	}

	.vb-label {
		font-weight: 600;
	}

	.vb:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 2px 6px -2px currentColor;
	}

	.vb:active:not(:disabled) {
		transform: translateY(0);
	}

	.vb:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* At-rest: colored tint with the color as text (fresh, readable). */
	.vb-support { color: var(--color-support); background: var(--color-support-bg); border-color: var(--color-support-border); }
	.vb-reject  { color: var(--color-reject);  background: var(--color-reject-bg);  border-color: var(--color-reject-border); }
	.vb-neutral { color: var(--color-neutral); background: var(--color-neutral-bg); border-color: var(--color-neutral-border); }

	/* Active: full color fill, white text. */
	.vb.active { color: white; }
	.vb.vb-support.active { background: var(--color-support); border-color: var(--color-support); }
	.vb.vb-reject.active  { background: var(--color-reject);  border-color: var(--color-reject); }
	.vb.vb-neutral.active { background: var(--color-neutral); border-color: var(--color-neutral); }

	.weight-badge {
		font-size: 0.75rem;
		font-family: var(--font-mono);
		opacity: 0.95;
		padding: 0.05rem 0.3rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.25);
	}

	.glyph {
		font-family: var(--font-mono);
		font-size: 1.15em;
		font-weight: 700;
	}

	.vote-row.compact .glyph {
		font-size: 1.1em;
	}
</style>
