<script lang="ts">
	import type { Argument, VoteSummary, VoteType, EvidenceType } from '$lib/models/types';
	import { getUserId } from '$lib/stores/user';
	import { primaryEvidenceType } from '$lib/utils/evidence';
	import VoteRow from '$lib/components/VoteRow.svelte';

	let { argument, forkedFromContent, onFork, onEdit }: {
		argument: Argument;
		forkedFromContent?: string;
		onFork?: (arg: Argument) => void;
		onEdit?: (arg: Argument) => void;
	} = $props();

	let voteSummary = $derived.by<VoteSummary>(() => {
		let support = 0, reject = 0, neutral = 0, voters = 0;
		for (const v of argument.votes) {
			const w = v.weight || 1;
			voters++;
			if (v.type === 'support') support += w;
			else if (v.type === 'reject') reject += w;
			else neutral += w;
		}
		return { support, reject, neutral, total: support + reject + neutral, voters };
	});

	let isAuthor = $derived.by(() => {
		if (typeof window === 'undefined') return false;
		return getUserId() === argument.meta.author_id;
	});

	let voting = $state(false);
	let currentVote = $state<VoteType | null>(null);
	let currentWeight = $state(1);
	let hasVotedLocally = $state(false);

	let serverVote = $derived.by<{ type: VoteType; weight: number } | null>(() => {
		if (typeof window === 'undefined') return null;
		const userId = getUserId();
		const existing = argument.votes.find((v) => v.user_id === userId);
		return existing ? { type: existing.type, weight: existing.weight || 1 } : null;
	});

	$effect(() => {
		if (!hasVotedLocally) {
			currentVote = serverVote?.type ?? null;
			currentWeight = serverVote?.weight ?? 1;
		}
	});

	// Evidence display: primary + list of sourced URLs
	let primaryEvidence = $derived<EvidenceType>(primaryEvidenceType(argument.attributes));
	let sourceUrls = $derived.by(() => {
		const seen = new Set<string>();
		const result: { url: string; type: EvidenceType }[] = [];
		for (const attr of argument.attributes) {
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

	async function castVote(type: VoteType, weight: number) {
		if (voting) return;
		voting = true;
		try {
			const userId = getUserId();
			const res = await fetch(`/api/arguments/${argument.id}/vote`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type, weight, user_id: userId })
			});
			if (res.ok) {
				const data = await res.json();
				const summary = data.vote_summary as VoteSummary;
				const newVote: VoteType | null = currentVote === type && currentWeight === weight ? null : type;
				const newWeight: number = newVote ? weight : 1;
				currentVote = newVote;
				currentWeight = newWeight;
				hasVotedLocally = true;
				const votes = [
					...Array(summary.support).fill({ user_id: '', type: 'support', weight: 1, cast_at: '' }),
					...Array(summary.reject).fill({ user_id: '', type: 'reject', weight: 1, cast_at: '' }),
					...Array(summary.neutral).fill({ user_id: '', type: 'neutral', weight: 1, cast_at: '' })
				];
				if (newVote) {
					const idx = votes.findIndex((v) => v.type === newVote);
					if (idx >= 0) votes[idx] = { user_id: userId, type: newVote, weight: newWeight, cast_at: new Date().toISOString() };
				}
				argument.votes = votes;
			}
		} finally {
			voting = false;
		}
	}
</script>

<article class="argument-card" data-arg-id={argument.id}>
	{#if forkedFromContent}
		<div class="fork-note" title={forkedFromContent}>
			<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="6" cy="3" r="2"></circle><circle cx="6" cy="21" r="2"></circle><circle cx="18" cy="12" r="2"></circle><path d="M18 10V8a2 2 0 0 0-2-2H8M6 5v14"></path>
			</svg>
			<span>based on: {forkedFromContent.slice(0, 60)}{forkedFromContent.length > 60 ? '…' : ''}</span>
		</div>
	{/if}

	<p class="argument-content">{argument.content}</p>

	<div class="argument-meta">
		<span class="evidence evidence-{primaryEvidence}" title="Evidence type (auto-detected)">
			{primaryEvidence}
		</span>
		{#if sourceUrls.length > 0}
			<ul class="sources">
				{#each sourceUrls as s}
					<li>
						<a href={s.url} target="_blank" rel="noopener noreferrer" class="source-link evidence-{s.type}">
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
			weightBudget={argument.stance}
			oncast={castVote}
		/>
		<div class="argument-actions">
			{#if isAuthor && onEdit}
				<button class="icon-btn" title="Edit your argument" onclick={() => onEdit?.(argument)}>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
				</button>
			{/if}
			{#if onFork}
				<button class="icon-btn" title="Fork &amp; adapt this argument" onclick={() => onFork?.(argument)}>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="6" cy="3" r="2"></circle><circle cx="6" cy="21" r="2"></circle><circle cx="18" cy="12" r="2"></circle><path d="M18 10V8a2 2 0 0 0-2-2H8M6 5v14"></path>
					</svg>
				</button>
			{/if}
		</div>
	</div>
</article>

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

	.fork-note {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: var(--text-xs);
		color: #b91c1c;
		padding-bottom: 0.375rem;
		border-bottom: 1px dashed rgba(220, 38, 38, 0.35);
	}

	.fork-note span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
	.evidence-emotional    { background: #fce7f3; color: #831843; border-color: #f9a8d4; }
	.evidence-logical      { background: #f1f5f9; color: #475569; border-color: #cbd5e1; }

	.sources {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		padding: 0;
		margin: 0;
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
	}

	.source-link:hover {
		border-color: currentColor;
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
