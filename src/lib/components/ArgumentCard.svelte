<script lang="ts">
	import type { Argument, VoteSummary, VoteType, EvidenceType } from '$lib/models/types';
	import { getUserId, markVotedArg } from '$lib/stores/user';
	import { primaryEvidenceType } from '$lib/utils/evidence';
	import { complexityStore } from '$lib/stores/complexity.svelte';
	import VoteRow from '$lib/components/VoteRow.svelte';
	import SwipeVote from '$lib/components/SwipeVote.svelte';
	import { budgetStore } from '$lib/stores/budget.svelte';
	import { m } from '$lib/paraglide/messages';

	let { argument, leading = false, variants = [], onFork, onEdit }: {
		argument: Argument;          // group root
		leading?: boolean;
		variants?: Argument[];       // forks (descendants) of the root
		onFork?: (arg: Argument) => void;
		onEdit?: (arg: Argument) => void;
	} = $props();

	function supportVotes(a: Argument): number {
		return a.votes.reduce((s, v) => s + (v.type === 'support' ? v.weight : 0), 0);
	}

	// The whole fork family (root + forks).
	let family = $derived<Argument[]>([argument, ...variants]);
	let hasVariants = $derived(family.length > 1);

	// The user has ONE vote across the whole group. Find where it currently sits.
	let groupVoteId = $derived.by<string | null>(() => {
		if (typeof window === 'undefined') return null;
		const userId = getUserId();
		for (const a of family) {
			if (a.votes.some((v) => v.user_id === userId)) return a.id;
		}
		return null;
	});

	// Leading variant = most support votes (this is what we show when collapsed).
	let leadVariant = $derived.by<Argument>(() => {
		let best = family[0];
		let bestScore = supportVotes(best);
		for (const a of family) {
			const s = supportVotes(a);
			if (s > bestScore) { best = a; bestScore = s; }
		}
		return best;
	});

	// The "active" variant = the one the user selected, else the leader.
	let selectedId = $state<string | null>(null);
	let active = $derived.by<Argument>(() => {
		const id = selectedId ?? groupVoteId;
		if (id) {
			const found = family.find((a) => a.id === id);
			if (found) return found;
		}
		return leadVariant;
	});

	// Expand / collapse + sort mode
	let expanded = $state(false);
	let sortMode = $state<'top' | 'latest'>('top');

	let sortedFamily = $derived.by<Argument[]>(() => {
		const arr = [...family];
		if (sortMode === 'top') {
			arr.sort((a, b) => supportVotes(b) - supportVotes(a));
		} else {
			arr.sort((a, b) => (a.meta.created_at < b.meta.created_at ? 1 : -1));
		}
		return arr;
	});

	let maxVariants = $derived(complexityStore.settings.max_arguments);
	let visibleVariants = $derived(sortedFamily.slice(0, maxVariants));
	let hiddenCount = $derived(Math.max(0, sortedFamily.length - visibleVariants.length));

	// Vote summary for the ACTIVE variant.
	let voteSummary = $derived.by<VoteSummary>(() => {
		let support = 0, reject = 0, neutral = 0, voters = 0;
		for (const v of active.votes) {
			const w = v.weight || 1;
			voters++;
			if (v.type === 'support') support += w;
			else if (v.type === 'reject') reject += w;
			else neutral += w;
		}
		return { support, reject, neutral, total: support + reject + neutral, voters };
	});

	// The user's current vote as it applies to the ACTIVE variant.
	let currentVote = $state<VoteType | null>(null);
	let currentWeight = $state(1);
	let hasVotedLocally = $state(false);
	$effect(() => {
		if (!hasVotedLocally) {
			const userId = typeof window !== 'undefined' ? getUserId() : '';
			const v = active.votes.find((vote) => vote.user_id === userId);
			currentVote = v ? v.type : null;
			currentWeight = v ? (v.weight || 1) : 1;
		}
	});

	let isAuthor = $derived.by(() => {
		if (typeof window === 'undefined') return false;
		return getUserId() === active.meta.author_id;
	});

	// Evidence + sources for the ACTIVE variant
	let primaryEvidence = $derived<EvidenceType>(primaryEvidenceType(active.attributes));
	let sourceUrls = $derived.by(() => {
		const seen = new Set<string>();
		const result: { url: string; type: EvidenceType }[] = [];
		for (const attr of active.attributes) {
			if (attr.source_url && !seen.has(attr.source_url)) {
				seen.add(attr.source_url);
				result.push({ url: attr.source_url, type: attr.evidence_type });
			}
		}
		return result;
	});
	function hostOf(url: string): string {
		try {
			return new URL(url).host.replace(/^www\./, '');
		} catch {
			return url;
		}
	}

	let voting = $state(false);

	// Select a variant from the list (does not vote — just changes which one is active).
	function selectVariant(a: Argument) {
		selectedId = a.id;
		hasVotedLocally = false; // re-sync currentVote to the newly-active variant
	}

	// Vote on the currently-active variant. Server enforces one vote per group.
	async function castVote(type: VoteType, weight: number) {
		if (voting) return;
		const target = active;
		const userId = getUserId();
		const existing = target.votes.find((v) => v.user_id === userId);
		const votingOnSame = !!existing;
		const isRetract = votingOnSame && currentVote === type && currentWeight === weight;
		// Base weight-1 votes are free; only extra weight draws from the pool.
		const chargeable = !isRetract && (type === 'support' || type === 'reject') && weight > 1;
		if (chargeable) {
			if (!budgetStore.canAffordWeight(weight)) return;
			budgetStore.spendWeight(weight);
		}
		voting = true;
		try {
			const res = await fetch(`/api/arguments/${target.id}/vote`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type, weight, user_id: userId })
			});
			if (!res.ok) {
				if (chargeable) budgetStore.refundWeight(weight);
				return;
			}
			const data = await res.json();
			const summary = data.vote_summary as VoteSummary;
			const newVote: VoteType | null = isRetract ? null : type;
			const newWeight: number = newVote ? weight : 1;
			currentVote = newVote;
			currentWeight = newWeight;
			hasVotedLocally = true;
			if (newVote) markVotedArg(target.id);

			const votes = [
				...Array(summary.support).fill({ user_id: '', type: 'support', weight: 1, cast_at: '' }),
				...Array(summary.reject).fill({ user_id: '', type: 'reject', weight: 1, cast_at: '' }),
				...Array(summary.neutral).fill({ user_id: '', type: 'neutral', weight: 1, cast_at: '' })
			];
			if (newVote) {
				const idx = votes.findIndex((v) => v.type === newVote);
				if (idx >= 0) votes[idx] = { user_id: userId, type: newVote, weight: newWeight, cast_at: new Date().toISOString() };
			}
			target.votes = votes;

			// Clear this user's vote from sibling variants locally (server already did).
			for (const a of family) {
				if (a.id === target.id) continue;
				if (a.votes.some((v) => v.user_id === userId)) {
					a.votes = a.votes.filter((v) => v.user_id !== userId);
				}
			}
		} finally {
			voting = false;
		}
	}
</script>

<SwipeVote oncast={castVote}>
	<article class="argument-card" class:argument-leading={leading} data-arg-id={active.id}>
	{#if hasVariants}
		<button class="variant-toggle" onclick={() => expanded = !expanded} aria-expanded={expanded}>
			<svg class="variant-fork-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<circle cx="6" cy="3" r="2"></circle><circle cx="6" cy="21" r="2"></circle><circle cx="18" cy="12" r="2"></circle><path d="M18 10V8a2 2 0 0 0-2-2H8M6 5v14"></path>
			</svg>
			<span class="variant-count">{family.length} {family.length === 1 ? m.variant_singular() : m.variant_plural()}</span>
			<svg class="variant-chevron" class:variant-chevron-open={expanded} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
		</button>
	{/if}

	{#if expanded}
		<div class="variant-picker">
			<div class="variant-picker-head">
				<span class="variant-picker-title">{m.variant_pick_title()}</span>
				<div class="variant-sort">
					<button class="variant-sort-btn" class:variant-sort-active={sortMode === 'top'} onclick={() => sortMode = 'top'}>{m.variant_sort_top()}</button>
					<button class="variant-sort-btn" class:variant-sort-active={sortMode === 'latest'} onclick={() => sortMode = 'latest'}>{m.variant_sort_latest()}</button>
				</div>
			</div>
			<ul class="variant-list">
				{#each visibleVariants as v, i (v.id)}
					<li>
						<label class="variant-option" class:variant-option-active={active.id === v.id}>
							<input
								type="radio"
								name="variant-{argument.id}"
								checked={active.id === v.id}
								onchange={() => selectVariant(v)}
							/>
							<span class="variant-option-body">
								<span class="variant-option-text">{v.content}</span>
								<span class="variant-option-meta">
									{#if i === 0 && sortMode === 'top'}<span class="variant-badge-lead">{m.variant_leading()}</span>{/if}
									<span class="variant-option-votes">{supportVotes(v)}</span>
								</span>
							</span>
						</label>
					</li>
				{/each}
			</ul>
			{#if hiddenCount > 0}
				<p class="variant-more">{m.variant_more({ count: hiddenCount })}</p>
			{/if}
		</div>
	{/if}

	<p class="argument-content">{active.content}</p>

	<div class="argument-meta">
		<span class="evidence evidence-{primaryEvidence}" title="Evidence type (auto-detected)">
			{primaryEvidence}
		</span>
		{#if active.categories && active.categories.length > 0}
			{#each active.categories as cat}
				<span class="arg-cat" title="Topic (auto-categorised)">{cat}</span>
			{/each}
		{/if}
		{#if active.hashtags && active.hashtags.length > 0}
			{#each active.hashtags as tag}
				<span class="arg-hashtag">#{tag}</span>
			{/each}
		{/if}
		{#if sourceUrls.length > 0}
			<ul class="sources">
				{#each sourceUrls as s}
					<li>
						<a
							href={s.url}
							target="_blank"
							rel="noopener noreferrer"
							class="source-link evidence-{s.type}"
							title={s.url}
						>
							<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
							{hostOf(s.url)}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="argument-footer">
		<VoteRow
			summary={voteSummary}
			currentVote={currentVote}
			currentWeight={currentWeight}
			voting={voting}
			compact
			oncast={castVote}
		/>
		<div class="argument-actions">
			{#if isAuthor && onEdit}
				<button class="icon-btn" title="Edit your argument" onclick={() => onEdit?.(active)}>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
				</button>
			{/if}
			{#if onFork}
				<button class="icon-btn" title="Propose a variant of this argument" onclick={() => onFork?.(active)}>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="6" cy="3" r="2"></circle><circle cx="6" cy="21" r="2"></circle><circle cx="18" cy="12" r="2"></circle><path d="M18 10V8a2 2 0 0 0-2-2H8M6 5v14"></path>
					</svg>
				</button>
			{/if}
		</div>
	</div>
	</article>
</SwipeVote>

<style>
	.argument-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--space-md);
		transition: box-shadow var(--transition-base);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.argument-card:hover {
		box-shadow: var(--shadow-sm);
	}

	.argument-card.argument-leading {
		padding: calc(var(--space-md) * 1.35);
		border-width: 1.5px;
		box-shadow: var(--shadow-sm);
	}

	.argument-card.argument-leading .argument-content {
		font-size: calc(var(--text-sm) * 1.08);
	}

	/* Variant toggle (collapsed header) */
	.variant-toggle {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.2rem 0;
		background: none;
		border: none;
		cursor: pointer;
		color: #059669;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.variant-fork-icon {
		flex-shrink: 0;
	}

	.variant-count {
		flex: 1;
		text-align: left;
	}

	.variant-chevron {
		flex-shrink: 0;
		transition: transform var(--transition-base);
		color: var(--color-text-muted);
	}

	.variant-chevron-open {
		transform: rotate(180deg);
	}

	/* Variant picker (expanded) */
	.variant-picker {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.5rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}

	.variant-picker-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.variant-picker-title {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	.variant-sort {
		display: flex;
		gap: 0.2rem;
	}

	.variant-sort-btn {
		font-size: 0.6rem;
		padding: 0.1rem 0.4rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.variant-sort-active {
		background: var(--color-text);
		color: var(--color-surface);
		border-color: var(--color-text);
	}

	.variant-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.variant-option {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.4rem 0.5rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		cursor: pointer;
		transition: border-color var(--transition-fast), background var(--transition-fast);
	}

	.variant-option:hover {
		border-color: var(--color-support);
	}

	.variant-option-active {
		border-color: var(--color-support);
		background: var(--color-support-bg);
	}

	.variant-option input {
		margin-top: 0.15rem;
		flex-shrink: 0;
		accent-color: var(--color-support);
	}

	.variant-option-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.variant-option-text {
		font-size: var(--text-xs);
		line-height: 1.4;
		color: var(--color-text);
	}

	.variant-option-meta {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.variant-badge-lead {
		font-size: 0.55rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #059669;
		background: #ecfdf5;
		padding: 0.05rem 0.3rem;
		border-radius: var(--radius-sm);
	}

	.variant-option-votes {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--color-text-light);
		font-family: var(--font-mono);
	}

	.variant-more {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-light);
		font-style: italic;
		text-align: center;
	}

	.argument-content {
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--color-text);
		margin: 0;
	}

	.argument-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.evidence {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.5rem;
		font-size: var(--text-xs);
		font-weight: 500;
		border-radius: var(--radius-sm);
		text-transform: capitalize;
		border: 1px solid transparent;
	}

	.evidence-study        { background: #dcfce7; color: #14532d; border-color: #86efac; }
	.evidence-authority    { background: #ede9fe; color: #4c1d95; border-color: #c4b5fd; }
	.evidence-experiential { background: #ffedd5; color: #7c2d12; border-color: #fdba74; }
	.evidence-logical      { background: #f1f5f9; color: #475569; border-color: #cbd5e1; }

	.arg-cat {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.5rem;
		font-size: var(--text-xs);
		font-weight: 500;
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
	}

	.arg-hashtag {
		display: inline-flex;
		align-items: center;
		padding: 0.05rem 0.5rem;
		font-size: 0.7rem;
		border-radius: 9999px;
		background: #ecfeff;
		color: #0e7490;
		border: 1px solid #a5f3fc;
	}

	.sources {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		padding: 0;
		margin: 0;
	}

	.sources li {
		display: flex;
	}

	.source-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: var(--text-xs);
		padding: 0.125rem 0.5rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-text-muted);
		text-decoration: none;
		transition: border-color var(--transition-fast), color var(--transition-fast);
	}

	.source-link:hover {
		border-color: currentColor;
		color: var(--color-text);
	}

	.argument-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--color-border);
		flex-wrap: wrap;
	}

	.argument-actions {
		display: inline-flex;
		gap: 0.25rem;
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		color: var(--color-text-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.icon-btn:hover {
		color: var(--color-primary);
		border-color: var(--color-primary);
		background: var(--color-primary-bg);
	}
</style>
