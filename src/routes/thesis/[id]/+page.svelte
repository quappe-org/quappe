<script lang="ts">
	import type { Argument, ArgumentStance, VoteType, VoteSummary, Category } from '$lib/models/types';
	import { complexityStore } from '$lib/stores/complexity.svelte';
	import { budgetStore } from '$lib/stores/budget.svelte';
	import { categoriesStore } from '$lib/stores/categories.svelte';
	import { activityStore } from '$lib/stores/activity.svelte';
	import { getUserId, markVotedArg } from '$lib/stores/user';
	import { forkFeedStore } from '$lib/stores/fork-feed.svelte';
	import { abbreviateNumber } from '$lib/utils/format';
	import ArgumentCard from '$lib/components/ArgumentCard.svelte';
	import ForkLines from '$lib/components/ForkLines.svelte';
	import VoteRow from '$lib/components/VoteRow.svelte';
	import type { ActivityDay } from '$lib/stores/data';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	let thesis = $state<any>(data.thesis);
	// svelte-ignore state_referenced_locally
	let args = $state<Argument[]>(data.arguments ?? []);
	// svelte-ignore state_referenced_locally
	let voteSummary = $state<VoteSummary | null>(data.voteSummary ?? null);
	// svelte-ignore state_referenced_locally
	let related = $state(data.related ?? []);
	// svelte-ignore state_referenced_locally
	let relatedMode = $state<string | null>(data.relatedMode ?? null);

	$effect(() => {
		thesis = data.thesis;
		args = data.arguments;
		voteSummary = data.voteSummary;
		related = data.related ?? [];
		relatedMode = data.relatedMode ?? null;
		activityStore.set(
			data.activity ?? [],
			data.thesis
				? `Activity: ${data.thesis.title.slice(0, 30)}${data.thesis.title.length > 30 ? '…' : ''}`
				: 'Thesis activity'
		);
		if (data.arguments && data.thesis) {
			forkFeedStore.update(data.arguments, data.thesis.title);
		}
	});

	let visibleRelated = $derived(related.slice(0, complexityStore.settings.max_related));

	let isAuthor = $derived.by(() => {
		if (typeof window === 'undefined' || !thesis) return false;
		return getUserId() === thesis.meta.author_id;
	});

	// Fork lookup
	let argIndex = $derived.by(() => {
		const map = new Map<string, Argument>();
		for (const a of args) map.set(a.id, a);
		return map;
	});

	function forkSourceContent(arg: Argument): string | undefined {
		if (!arg.forked_from_id) return undefined;
		return argIndex.get(arg.forked_from_id)?.content;
	}

	// Sort helper by weighted support-reject
	function scoreOf(a: Argument): number {
		let s = 0;
		for (const v of a.votes) {
			const w = v.weight || 1;
			if (v.type === 'support') s += w;
			else if (v.type === 'reject') s -= w;
		}
		return s;
	}

	let supportArgs = $derived.by(() => {
		return args
			.filter((a) => a.stance === 'support')
			.sort((a, b) => scoreOf(b) - scoreOf(a))
			.slice(0, complexityStore.settings.max_arguments);
	});

	let rejectArgs = $derived.by(() => {
		return args
			.filter((a) => a.stance === 'reject')
			.sort((a, b) => scoreOf(b) - scoreOf(a))
			.slice(0, complexityStore.settings.max_arguments);
	});

	let totalSupport = $derived(args.filter((a) => a.stance === 'support').length);
	let totalReject = $derived(args.filter((a) => a.stance === 'reject').length);

	// --- Thesis voting ---
	let voting = $state(false);
	let currentVote = $state<VoteType | null>(null);
	let currentWeight = $state(1);
	let hasVotedLocally = $state(false);

	// Fork-line refs
	let supportColRef = $state<HTMLElement | null>(null);
	let rejectColRef = $state<HTMLElement | null>(null);

	$effect(() => {
		if (typeof window === 'undefined' || !thesis || hasVotedLocally) return;
		const userId = getUserId();
		const existing = thesis.votes?.find((v: any) => v.user_id === userId);
		currentVote = existing ? existing.type : null;
		currentWeight = existing?.weight ?? 1;
	});

	async function castThesisVote(type: VoteType, weight: number) {
		if (voting || !thesis) return;
		voting = true;
		try {
			const userId = getUserId();
			const res = await fetch(`/api/theses/${thesis.id}/vote`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type, weight, user_id: userId })
			});
			if (res.ok) {
				const responseData = await res.json();
				voteSummary = responseData.vote_summary;
				const isRetract = currentVote === type && currentWeight === weight;
				currentVote = isRetract ? null : type;
				currentWeight = isRetract ? 1 : weight;
				hasVotedLocally = true;
			}
		} finally {
			voting = false;
		}
	}

	// --- Argument form ---
	type ArgFormMode = 'new' | 'fork' | 'edit';
	let showArgForm = $state(false);
	let argFormMode = $state<ArgFormMode>('new');
	let argContent = $state('');
	let argStance = $state<ArgumentStance>('support');
	let argIsEmotional = $state(false);
	let argForkedFromId = $state<string | undefined>(undefined);
	let argEditingId = $state<string | undefined>(undefined);
	let argSubmitting = $state(false);
	let argError = $state<string | null>(null);

	function openNewArg(stance: ArgumentStance) {
		argFormMode = 'new';
		argStance = stance;
		argContent = '';
		argIsEmotional = false;
		argForkedFromId = undefined;
		argEditingId = undefined;
		argError = null;
		showArgForm = true;
	}

	function openFork(source: Argument) {
		argFormMode = 'fork';
		argStance = source.stance;
		argContent = source.content;
		argIsEmotional = source.attributes.some((a) => a.evidence_type === 'emotional');
		argForkedFromId = source.id;
		argEditingId = undefined;
		showArgForm = true;
	}

	function openEdit(target: Argument) {
		argFormMode = 'edit';
		argStance = target.stance;
		argContent = target.content;
		argIsEmotional = target.attributes.some((a) => a.evidence_type === 'emotional');
		argForkedFromId = target.forked_from_id;
		argEditingId = target.id;
		showArgForm = true;
	}

	function cancelArgForm() {
		showArgForm = false;
		argEditingId = undefined;
		argForkedFromId = undefined;
		argError = null;
	}

	async function extractError(res: Response): Promise<string> {
		if (res.status === 429) return 'Too many requests — wait a moment and try again.';
		if (res.status === 413) return 'Text too long — please shorten it.';
		if (res.status === 403) {
			const body = await res.json().catch(() => ({}));
			return body?.error ?? 'Not allowed.';
		}
		if (res.status === 400) {
			const body = await res.json().catch(() => ({}));
			return body?.error ?? 'Invalid input.';
		}
		return `Server responded ${res.status}. Please try again.`;
	}

	async function submitArgument() {
		if (!argContent.trim() || !thesis) return;
		argError = null;

		if (argFormMode === 'edit' && argEditingId) {
			argSubmitting = true;
			try {
				const res = await fetch(`/api/arguments/${argEditingId}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						content: argContent.trim(),
						is_emotional: argIsEmotional,
						user_id: getUserId()
					})
				});
				if (!res.ok) {
					argError = await extractError(res);
					return;
				}
				const updated: Argument = await res.json();
				args = args.map((a) => (a.id === updated.id ? updated : a));
				cancelArgForm();
			} finally {
				argSubmitting = false;
			}
			return;
		}

		const budgetKind = argStance === 'support' ? 'support' : 'reject';
		if (!budgetStore.canCreate(budgetKind)) return;

		argSubmitting = true;
		try {
			const res = await fetch('/api/arguments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					thesis_id: thesis.id,
					content: argContent.trim(),
					stance: argStance,
					is_emotional: argIsEmotional,
					forked_from_id: argForkedFromId,
					author_id: getUserId()
				})
			});
			if (!res.ok) {
				argError = await extractError(res);
				return;
			}
			const newArg: Argument = await res.json();
			budgetStore.spend(budgetKind);
			args = [...args, newArg];
			cancelArgForm();
		} finally {
			argSubmitting = false;
		}
	}

	// --- Thesis edit ---
	let editingThesis = $state(false);
	let editTitle = $state('');
	let editDescription = $state('');
	let editCategories = $state<Category[]>([]);
	let editSubmitting = $state(false);

	function openEditThesis() {
		if (!thesis) return;
		editTitle = thesis.title;
		editDescription = thesis.description;
		editCategories = [...thesis.categories];
		editingThesis = true;
	}

	function toggleEditCategory(cat: Category) {
		if (editCategories.includes(cat)) editCategories = editCategories.filter((c) => c !== cat);
		else editCategories = [...editCategories, cat];
	}

	async function submitEditThesis() {
		if (!thesis) return;
		editSubmitting = true;
		try {
			const res = await fetch(`/api/theses/${thesis.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: editTitle.trim(),
					description: editDescription.trim(),
					categories: editCategories,
					user_id: getUserId()
				})
			});
			if (res.ok) {
				const updated = await res.json();
				thesis = { ...thesis, ...updated };
				editingThesis = false;
			}
		} finally {
			editSubmitting = false;
		}
	}

	async function toggleArchive() {
		if (!thesis) return;
		const newState = !thesis.archived;
		if (!confirm(newState ? 'Archive this thesis?' : 'Unarchive this thesis?')) return;
		const res = await fetch(`/api/theses/${thesis.id}/archive`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ archived: newState })
		});
		if (res.ok) {
			const updated = await res.json();
			thesis = { ...thesis, ...updated };
		}
	}
</script>

{#if thesis}
	<article class="thesis-detail" class:archived={thesis.archived}>
		<a href="/" class="back-link">← Back</a>

		{#if thesis.archived}
			<div class="archived-banner">This thesis has been archived.</div>
		{/if}

		<!-- Thesis tile -->
		<div class="thesis-tile card">
			{#if editingThesis}
				<form class="edit-form" onsubmit={(e) => { e.preventDefault(); submitEditThesis(); }}>
					<div class="form-group">
						<label for="edit-title">Title</label>
						<input id="edit-title" type="text" bind:value={editTitle} maxlength="200" required />
					</div>
					<div class="form-group">
						<label for="edit-desc">Description</label>
						<textarea id="edit-desc" bind:value={editDescription} maxlength="2000" required></textarea>
					</div>
					<div class="form-group">
						<label for="edit-categories">Categories</label>
						<div class="category-grid" id="edit-categories">
							{#each categoriesStore.list as cat}
								<button
									type="button"
									class="tag category-btn"
									class:selected={editCategories.includes(cat)}
									onclick={() => toggleEditCategory(cat)}
								>{cat}</button>
							{/each}
						</div>
					</div>
					<div class="form-actions">
						<button class="btn btn-primary" type="submit" disabled={editSubmitting}>
							{editSubmitting ? 'Saving...' : 'Save changes'}
						</button>
						<button class="btn" type="button" onclick={() => (editingThesis = false)}>Cancel</button>
					</div>
				</form>
			{:else}
				<h1 class="thesis-title">{thesis.title}</h1>
				<p class="thesis-description">{thesis.description}</p>

				<div class="thesis-meta-row">
					{#each thesis.categories as category}
						<span class="tag">{category}</span>
					{/each}
					<span class="tag lifecycle-tag lifecycle-{thesis.lifecycle?.state ?? 'seedling'}" title="Lifecycle state">
						{thesis.lifecycle?.state ?? 'seedling'}
					</span>
				</div>

				{#if voteSummary && voteSummary.total > 0}
					<div class="thesis-vote-bar-wrap" title="+{voteSummary.support} support · −{voteSummary.reject} reject · ~{voteSummary.neutral} neutral">
						<div class="thesis-vote-bar">
							{#if voteSummary.support > 0}
								<span class="tvb-seg tvb-support" style="flex: {voteSummary.support}"></span>
							{/if}
							{#if voteSummary.neutral > 0}
								<span class="tvb-seg tvb-neutral" style="flex: {voteSummary.neutral}"></span>
							{/if}
							{#if voteSummary.reject > 0}
								<span class="tvb-seg tvb-reject" style="flex: {voteSummary.reject}"></span>
							{/if}
						</div>
						<div class="thesis-vote-nums">
							<span class="tvn-support">+{voteSummary.support}</span>
							<span class="tvn-reject">−{voteSummary.reject}</span>
							<span class="tvn-voters">{abbreviateNumber(voteSummary.voters ?? 0)} voter{(voteSummary.voters ?? 0) === 1 ? '' : 's'}</span>
						</div>
					</div>
				{/if}

				<div class="thesis-tile-footer">
					{#if voteSummary}
						<VoteRow
							summary={voteSummary}
							currentVote={currentVote}
							currentWeight={currentWeight}
							voting={voting}
							oncast={castThesisVote}
						/>
					{/if}
					<div class="thesis-admin-row">
						{#if isAuthor}
							<button class="btn btn-sm" onclick={openEditThesis}>Edit</button>
						{/if}
						<button class="btn btn-sm" onclick={toggleArchive}>
							{thesis.archived ? 'Unarchive' : 'Archive'}
						</button>
					</div>
				</div>
			{/if}
		</div>

		<section class="arguments-section">
			{#if showArgForm}
				<form class="card argument-form" onsubmit={(e) => { e.preventDefault(); submitArgument(); }}>
					<h3 class="form-title">
						{#if argFormMode === 'edit'}Edit argument{:else if argFormMode === 'fork'}Fork &amp; adapt{:else}New argument{/if}
					</h3>

					{#if argFormMode === 'fork'}
						<p class="form-hint">You are creating a new argument based on an existing one. Both will exist in parallel.</p>
					{/if}

					{#if argFormMode !== 'edit'}
						<div class="stance-toggle">
							<button
								type="button"
								class="btn btn-sm stance-btn"
								class:stance-support={argStance === 'support'}
								onclick={() => argFormMode !== 'fork' && (argStance = 'support')}
								disabled={argFormMode === 'fork'}
							>Supports thesis</button>
							<button
								type="button"
								class="btn btn-sm stance-btn"
								class:stance-reject={argStance === 'reject'}
								onclick={() => argFormMode !== 'fork' && (argStance = 'reject')}
								disabled={argFormMode === 'fork'}
							>Rejects thesis</button>
						</div>
					{/if}

					<div class="form-group">
						<label for="arg-content">Your argument <span class="hint-inline">Links are auto-detected. Just paste URLs into your text.</span></label>
						<textarea id="arg-content" bind:value={argContent} placeholder="State your reasoning. Paste sources as URLs — they will be classified automatically." maxlength="800" required></textarea>
					</div>

					<label class="emotional-check">
						<input type="checkbox" bind:checked={argIsEmotional} />
						<span>This is an emotional argument <span class="hint-inline">(Herzensangelegenheit — a heart matter. Overrides evidence detection.)</span></span>
					</label>

					<div class="form-actions">
						<button class="btn btn-primary" type="submit" disabled={argSubmitting}>
							{#if argSubmitting}Submitting...{:else if argFormMode === 'edit'}Save changes{:else if argFormMode === 'fork'}Submit fork{:else}Submit{/if}
						</button>
						<button class="btn" type="button" onclick={cancelArgForm}>Cancel</button>
					</div>

					{#if argError}
						<p class="arg-error" role="alert">{argError}</p>
					{/if}
				</form>
			{/if}

			<div class="arguments-columns">
				<div class="arguments-col col-support">
					<div class="col-header">
						<h2 class="col-title">
							<span class="col-marker" aria-hidden="true"></span>
							Supporting
							<span class="col-count">({totalSupport})</span>
						</h2>
						<button
							class="btn btn-sm add-arg-btn"
							onclick={() => openNewArg('support')}
							disabled={!budgetStore.canCreate('support')}
							title={!budgetStore.canCreate('support') ? 'Daily budget for support arguments depleted' : ''}
						>+ argument ({budgetStore.support})</button>
					</div>
					<div class="arguments-list" bind:this={supportColRef}>
						<ForkLines arguments={supportArgs} container={supportColRef} />
						{#each supportArgs as arg, idx (arg.id)}
							<ArgumentCard
								argument={arg}
								leading={idx === 0}
								forkedFromContent={forkSourceContent(arg)}
								onFork={openFork}
								onEdit={openEdit}
							/>
						{/each}
						{#if supportArgs.length === 0}
							<p class="col-empty">No supporting arguments yet.</p>
						{/if}
					</div>
				</div>

				<div class="arguments-col col-reject">
					<div class="col-header">
						<h2 class="col-title">
							<span class="col-marker" aria-hidden="true"></span>
							Rejecting
							<span class="col-count">({totalReject})</span>
						</h2>
						<button
							class="btn btn-sm add-arg-btn"
							onclick={() => openNewArg('reject')}
							disabled={!budgetStore.canCreate('reject')}
							title={!budgetStore.canCreate('reject') ? 'Daily budget for reject arguments depleted' : ''}
						>+ argument ({budgetStore.reject})</button>
					</div>
					<div class="arguments-list" bind:this={rejectColRef}>
						<ForkLines arguments={rejectArgs} container={rejectColRef} />
						{#each rejectArgs as arg, idx (arg.id)}
							<ArgumentCard
								argument={arg}
								leading={idx === 0}
								forkedFromContent={forkSourceContent(arg)}
								onFork={openFork}
								onEdit={openEdit}
							/>
						{/each}
						{#if rejectArgs.length === 0}
							<p class="col-empty">No rejecting arguments yet.</p>
						{/if}
					</div>
				</div>
			</div>
		</section>

		{#if visibleRelated.length > 0}
			<aside class="related-panel">
				<div class="related-head">
					<span class="related-title">Verwandte Thesen</span>
					<span class="related-mode" title={relatedMode === 'semantic' ? 'Ranked by semantic similarity' : 'Ranked by shared categories'}>
						{relatedMode === 'semantic' ? 'semantisch' : 'thematisch'}
					</span>
				</div>
				<ul class="related-list">
					{#each visibleRelated as item (item.thesis.id)}
						<li>
							<a class="related-link" href="/thesis/{item.thesis.id}">
								<span class="related-thesis-title">{item.thesis.title}</span>
								<span class="related-cats">
									{#each item.thesis.categories.slice(0, 3) as cat}
										<span class="related-cat">{cat}</span>
									{/each}
								</span>
							</a>
						</li>
					{/each}
				</ul>
			</aside>
		{/if}
	</article>
{:else}
	<div class="not-found">
		<h1>Thesis not found</h1>
		<a href="/" class="btn btn-primary">Back to home</a>
	</div>
{/if}

<style>
	.thesis-detail {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.thesis-detail.archived {
		opacity: 0.7;
	}

	.archived-banner {
		padding: 0.5rem 0.75rem;
		background: #fef3c7;
		color: #92400e;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.back-link {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		display: inline-block;
	}

	.back-link:hover {
		color: var(--color-primary);
	}

	/* Thesis tile */
	.thesis-tile {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		background: white;
		border-radius: var(--radius-lg);
		padding: 1.5rem;
	}

	.thesis-title {
		font-size: var(--text-3xl);
		font-weight: 700;
		line-height: 1.2;
		margin: 0;
	}

	.thesis-description {
		font-size: var(--text-base);
		color: var(--color-text-muted);
		line-height: 1.6;
		margin: 0;
	}

	.thesis-meta-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	/* Vote bar */
	.thesis-vote-bar-wrap {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.thesis-vote-bar {
		flex: 1;
		display: flex;
		height: 6px;
		border-radius: 3px;
		overflow: hidden;
		gap: 1px;
		background: var(--color-bg);
	}

	.tvb-seg {
		display: block;
		height: 100%;
		min-width: 2px;
		border-radius: 2px;
	}

	.tvb-support { background: var(--color-support); }
	.tvb-neutral  { background: var(--color-neutral); }
	.tvb-reject   { background: var(--color-reject); }

	.thesis-vote-nums {
		display: flex;
		gap: 0.5rem;
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		align-items: center;
	}

	.tvn-support { color: var(--color-support); }
	.tvn-reject  { color: var(--color-reject); }
	.tvn-voters  { color: var(--color-text-light); margin-left: 0.25rem; }

	/* Footer row: vote buttons + admin actions */
	.thesis-tile-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--color-border);
		flex-wrap: wrap;
	}

	.thesis-admin-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.lifecycle-tag {
		text-transform: capitalize;
		background: var(--color-bg);
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
	}
	.lifecycle-tag.lifecycle-crystallized {
		background: #cffafe;
		color: #164e63;
		border-color: #67e8f9;
	}
	.lifecycle-tag.lifecycle-discussed { background: #dbeafe; color: #1e3a8a; border-color: #93c5fd; }
	.lifecycle-tag.lifecycle-contested { background: #fef3c7; color: #78350f; border-color: #fbbf24; }

	.arguments-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.argument-form,
	.edit-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.form-title {
		font-size: var(--text-base);
		font-weight: 600;
	}

	.form-hint {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.hint-inline {
		font-weight: 400;
		color: var(--color-text-light);
		font-size: var(--text-xs);
		margin-left: 0.5rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.emotional-check {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: var(--text-sm);
		color: var(--color-text);
		cursor: pointer;
	}

	.emotional-check input {
		accent-color: #ec4899;
	}

	.form-actions {
		display: flex;
		gap: 0.5rem;
	}

	.arg-error {
		margin: 0;
		padding: 0.5rem 0.75rem;
		background: var(--color-reject-bg);
		border: 1px solid var(--color-reject);
		border-radius: var(--radius-md);
		color: var(--color-reject);
		font-size: var(--text-sm);
	}

	.stance-toggle {
		display: flex;
		gap: 0.5rem;
	}

	.stance-btn {
		flex: 1;
		justify-content: center;
		border: 2px solid var(--color-border);
	}

	.stance-btn:disabled { opacity: 0.6; cursor: not-allowed; }
	.stance-btn.stance-support {
		border-color: var(--color-support);
		background: var(--color-support-bg);
		color: var(--color-support);
		font-weight: 600;
	}
	.stance-btn.stance-reject {
		border-color: var(--color-reject);
		background: var(--color-reject-bg);
		color: var(--color-reject);
		font-weight: 600;
	}

	.category-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.category-btn {
		cursor: pointer;
		border: 1px solid var(--color-border);
	}

	.category-btn.selected {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	/* Two-column layout */
	.arguments-columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
		align-items: start;
	}

	@media (max-width: 900px) {
		.arguments-columns { grid-template-columns: 1fr; }
	}

	.arguments-col {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.875rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
	}

	.col-support {
		background: linear-gradient(180deg, rgba(134, 239, 172, 0.10) 0%, transparent 40%);
		border-left: 3px solid var(--color-support);
	}

	.col-reject {
		background: linear-gradient(180deg, rgba(252, 165, 165, 0.10) 0%, transparent 40%);
		border-left: 3px solid var(--color-reject);
	}

	.col-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding-bottom: 0.375rem;
	}

	.col-title {
		display: flex;
		align-items: baseline;
		gap: 0.375rem;
		font-size: var(--text-lg);
		font-weight: 700;
		margin: 0;
	}

	.col-support .col-title { color: var(--color-support); }
	.col-reject .col-title  { color: var(--color-reject); }

	.col-count {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-muted);
		font-family: var(--font-mono);
	}

	.col-marker {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		align-self: center;
	}

	.col-support .col-marker { background: var(--color-support); }
	.col-reject  .col-marker { background: var(--color-reject); }

	/* Small "add argument" button - deliberately not styled like a bold action.
	   It's a helper, not the primary action of the column. */
	.add-arg-btn {
		font-size: var(--text-xs);
		font-weight: 500;
		padding: 0.25rem 0.625rem;
		background: transparent;
		border: 1px solid var(--color-border);
		color: var(--color-text-muted);
	}
	.add-arg-btn:hover:not(:disabled) {
		background: var(--color-surface);
		color: var(--color-text);
	}

	.arguments-list {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.arguments-list :global(.argument-card) {
		position: relative;
		z-index: 1;
	}

	.col-empty {
		font-size: var(--text-sm);
		color: var(--color-text-light);
		text-align: center;
		padding: 1.5rem 1rem;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}

	.not-found {
		text-align: center;
		padding: 4rem 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	/* Related theses */
	.related-panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.related-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.related-title {
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}

	.related-mode {
		font-size: 0.65rem;
		font-family: var(--font-mono);
		color: var(--color-text-light);
		text-transform: lowercase;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 9999px;
		padding: 0.1rem 0.5rem;
	}

	.related-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.related-link {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.4rem 0.5rem;
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: var(--color-text);
		transition: background var(--transition-fast);
	}

	.related-link:hover {
		background: var(--color-bg);
	}

	.related-thesis-title {
		font-size: var(--text-sm);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.related-cats {
		display: flex;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.related-cat {
		font-size: 0.65rem;
		font-family: var(--font-mono);
		color: var(--color-text-light);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 9999px;
		padding: 0.1rem 0.45rem;
		text-transform: capitalize;
	}
</style>
