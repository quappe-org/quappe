<script lang="ts">
	import type { Thesis, VoteSummary, VoteType } from '$lib/models/types';
	import { getUserId } from '$lib/stores/user';
	import { abbreviateNumber } from '$lib/utils/format';
	import VoteRow from '$lib/components/VoteRow.svelte';

	let { thesis, heatRatio = 0, argumentCount = 0 }: { thesis: Thesis; heatRatio?: number; argumentCount?: number } = $props();

	let voteSummary = $derived.by<VoteSummary>(() => {
		let support = 0, reject = 0, neutral = 0, voters = 0;
		for (const v of thesis.votes) {
			const w = v.weight || 1;
			voters++;
			if (v.type === 'support') support += w;
			else if (v.type === 'reject') reject += w;
			else neutral += w;
		}
		return { support, reject, neutral, total: support + reject + neutral, voters };
	});

	let heat = $derived.by(() => {
		if (heatRatio >= 1.5) return 'hot';
		if (heatRatio >= 0.75) return 'warm';
		if (heatRatio > 0) return 'cool';
		return 'cold';
	});

	let voting = $state(false);
	let currentVote = $state<VoteType | null>(null);
	let currentWeight = $state(1);
	let hasVotedLocally = $state(false);

	let serverVote = $derived.by<{ type: VoteType; weight: number } | null>(() => {
		if (typeof window === 'undefined') return null;
		const userId = getUserId();
		const existing = thesis.votes.find((v) => v.user_id === userId);
		return existing ? { type: existing.type, weight: existing.weight || 1 } : null;
	});

	$effect(() => {
		if (!hasVotedLocally) {
			currentVote = serverVote?.type ?? null;
			currentWeight = serverVote?.weight ?? 1;
		}
	});

	async function castVote(type: VoteType, weight: number) {
		if (voting) return;
		voting = true;
		try {
			const userId = getUserId();
			const res = await fetch(`/api/theses/${thesis.id}/vote`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type, weight, user_id: userId })
			});
			if (res.ok) {
				const data = await res.json();
				const summary = data.vote_summary as VoteSummary;
				// If same type and same weight, server retracted the vote.
				const newVote: VoteType | null = currentVote === type && currentWeight === weight ? null : type;
				const newWeight: number = newVote ? weight : 1;
				currentVote = newVote;
				currentWeight = newWeight;
				hasVotedLocally = true;
				// Rebuild synthetic votes list so summary reactivity works for this card.
				const totalWeightSupport = summary.support;
				const totalWeightReject = summary.reject;
				const totalWeightNeutral = summary.neutral;
				const votes = [
					...Array(totalWeightSupport).fill({ user_id: '', type: 'support', weight: 1, cast_at: '' }),
					...Array(totalWeightReject).fill({ user_id: '', type: 'reject', weight: 1, cast_at: '' }),
					...Array(totalWeightNeutral).fill({ user_id: '', type: 'neutral', weight: 1, cast_at: '' })
				];
				if (newVote) {
					// Replace one placeholder with the real user's vote to preserve current-vote detection.
					const idx = votes.findIndex((v) => v.type === newVote);
					if (idx >= 0) {
						votes[idx] = {
							user_id: userId,
							type: newVote,
							weight: newWeight,
							cast_at: new Date().toISOString()
						};
					}
				}
				thesis.votes = votes;
			}
		} finally {
			voting = false;
		}
	}
</script>

<a
	href="/thesis/{thesis.id}"
	class="card thesis-card heat-{heat} lifecycle-band-{thesis.lifecycle?.state ?? 'seedling'}"
>
	<span
		class="side-band heat-band"
		title="Heat: {heat} (recent activity {heatRatio.toFixed(2)}× baseline)"
		aria-hidden="true"
	></span>
	<span
		class="side-band lifecycle-band-strip"
		title="Lifecycle: {thesis.lifecycle?.state ?? 'seedling'} — click for details"
		role="button"
		tabindex="0"
		aria-label="Lifecycle: {thesis.lifecycle?.state ?? 'seedling'} — open explanation"
		onclick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = '/about#lifecycle'; }}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); window.location.href = '/about#lifecycle'; } }}
	></span>
	<h3 class="thesis-title">{thesis.title}</h3>
	<p class="thesis-description">{thesis.description}</p>

	<div class="thesis-categories">
		{#each thesis.categories as category}
			<span class="tag">{category}</span>
		{/each}
	</div>

	<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
	<div class="thesis-footer" onclick={(e) => e.preventDefault()} onkeydown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}>
		{#if voteSummary.total > 0}
			<div class="vote-bar-wrap" title="+{voteSummary.support} support · −{voteSummary.reject} reject · ~{voteSummary.neutral} neutral">
				<div class="vote-bar">
					{#if voteSummary.support > 0}
						<span class="vb-seg vb-seg-support" style="flex: {voteSummary.support}"></span>
					{/if}
					{#if voteSummary.neutral > 0}
						<span class="vb-seg vb-seg-neutral" style="flex: {voteSummary.neutral}"></span>
					{/if}
					{#if voteSummary.reject > 0}
						<span class="vb-seg vb-seg-reject" style="flex: {voteSummary.reject}"></span>
					{/if}
				</div>
			</div>
		{/if}
		<div class="thesis-footer-row">
			<VoteRow
				summary={voteSummary}
				currentVote={currentVote}
				currentWeight={currentWeight}
				voting={voting}
				compact
				oncast={castVote}
			/>
			<span class="badge badge-arguments" title="Arguments">
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
				</svg>
				{abbreviateNumber(argumentCount)}
			</span>
		</div>
	</div>
</a>

<style>
	.thesis-card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		position: relative;
		padding-left: calc(var(--card-padding, 1rem) + 16px);
		transition: box-shadow var(--transition-base), transform var(--transition-fast);
		text-decoration: none;
		color: inherit;
		cursor: pointer;
		min-height: 200px;
		justify-content: space-between;
		overflow: hidden;
	}

	/* Two vertical bands on the left edge: heat (outer) and lifecycle (inner). */
	.side-band {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 8px;
		background: var(--color-border);
	}
	.heat-band {
		left: 0;
	}
	.lifecycle-band-strip {
		left: 8px;
		cursor: pointer;
		transition: filter var(--transition-fast);
	}
	.lifecycle-band-strip:hover {
		filter: brightness(0.85);
	}

	/* Heat band */
	.thesis-card.heat-hot  .heat-band { background: #ea580c; }
	.thesis-card.heat-warm .heat-band { background: #f59e0b; }
	.thesis-card.heat-cool .heat-band { background: #93c5fd; }
	.thesis-card.heat-cold .heat-band { background: #3b82f6; }
	.thesis-card.heat-hot           { box-shadow: inset 0 0 0 1px rgba(234, 88, 12, 0.12); }

	/* Lifecycle band */
	.thesis-card.lifecycle-band-seedling     .lifecycle-band-strip { background: #bef264; }
	.thesis-card.lifecycle-band-discussed    .lifecycle-band-strip { background: #93c5fd; }
	.thesis-card.lifecycle-band-contested    .lifecycle-band-strip { background: #fbbf24; }
	.thesis-card.lifecycle-band-crystallized .lifecycle-band-strip { background: #67e8f9; }
	.thesis-card.lifecycle-band-faded        .lifecycle-band-strip { background: #d4d4d8; }
	.thesis-card.lifecycle-band-dormant      .lifecycle-band-strip { background: #a1a1aa; }

	.thesis-card:hover {
		box-shadow: var(--shadow-md);
		transform: translateY(-1px);
	}

	.thesis-card:hover .thesis-title {
		color: var(--color-primary);
	}

	.thesis-title {
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: 1.3;
		transition: color var(--transition-fast);
	}

	.thesis-description {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.thesis-categories {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.badge-arguments {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.5rem;
		font-size: var(--text-xs);
		font-weight: 500;
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
	}

	.thesis-footer {
		margin-top: 0.25rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.thesis-footer-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.vote-bar-wrap {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.vote-bar {
		flex: 1;
		display: flex;
		height: 5px;
		border-radius: 3px;
		overflow: hidden;
		gap: 1px;
		background: var(--color-bg);
	}

	.vb-seg {
		display: block;
		height: 100%;
		min-width: 2px;
		border-radius: 2px;
	}

	.vb-seg-support { background: var(--color-support); }
	.vb-seg-neutral { background: var(--color-neutral); }
	.vb-seg-reject  { background: var(--color-reject); }
</style>
