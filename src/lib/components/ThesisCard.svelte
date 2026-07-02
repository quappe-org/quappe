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

<a href="/thesis/{thesis.id}" class="card thesis-card heat-{heat}">
	<h3 class="thesis-title">{thesis.title}</h3>
	<p class="thesis-description">{thesis.description}</p>

	<div class="thesis-categories">
		{#each thesis.categories as category}
			<span class="tag">{category}</span>
		{/each}
	</div>

	<div class="thesis-badges">
		<span class="badge badge-arguments" title="Arguments">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
			</svg>
			{abbreviateNumber(argumentCount)}
		</span>
		<span class="badge lifecycle-badge lifecycle-{thesis.lifecycle?.state ?? 'seedling'}" title="Lifecycle: {thesis.lifecycle?.state ?? 'seedling'} (quality {Math.round((thesis.lifecycle?.quality_score ?? 0) * 100)}%)">
			{thesis.lifecycle?.state ?? 'seedling'}
		</span>
	</div>

	<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
	<div class="thesis-footer" onclick={(e) => e.preventDefault()} onkeydown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}>
		<VoteRow
			summary={voteSummary}
			currentVote={currentVote}
			currentWeight={currentWeight}
			voting={voting}
			compact
			weightBudget={currentVote === 'reject' ? 'reject' : 'support'}
			oncast={castVote}
		/>
	</div>
</a>

<style>
	.thesis-card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		border-left: 4px solid var(--color-border);
		transition: border-color var(--transition-base), box-shadow var(--transition-base), transform var(--transition-fast);
		text-decoration: none;
		color: inherit;
		cursor: pointer;
		min-height: 200px;
		justify-content: space-between;
	}

	.thesis-card:hover {
		box-shadow: var(--shadow-md);
		transform: translateY(-1px);
	}

	.thesis-card:hover .thesis-title {
		color: var(--color-primary);
	}

	.thesis-card.heat-hot   { border-left-color: #ea580c; box-shadow: inset 0 0 0 1px rgba(234, 88, 12, 0.12); }
	.thesis-card.heat-warm  { border-left-color: #f59e0b; }
	.thesis-card.heat-cool  { border-left-color: #93c5fd; }
	.thesis-card.heat-cold  { border-left-color: #3b82f6; }

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

	.thesis-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		align-items: center;
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

	.lifecycle-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.5rem;
		font-size: var(--text-xs);
		font-weight: 500;
		border-radius: var(--radius-sm);
		text-transform: capitalize;
		border: 1px solid transparent;
	}

	.lifecycle-seedling     { background: #ecfccb; color: #365314; border-color: #bef264; }
	.lifecycle-discussed    { background: #dbeafe; color: #1e3a8a; border-color: #93c5fd; }
	.lifecycle-contested    { background: #fef3c7; color: #78350f; border-color: #fbbf24; }
	.lifecycle-crystallized { background: #cffafe; color: #164e63; border-color: #67e8f9; font-weight: 600; }
	.lifecycle-faded        { background: #f1f5f9; color: #64748b; border-color: #cbd5e1; }
	.lifecycle-dormant      { background: #f8fafc; color: #94a3b8; border-color: #e2e8f0; }

	.thesis-footer {
		margin-top: 0.25rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--color-border);
	}
</style>
