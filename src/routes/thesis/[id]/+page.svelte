<script lang="ts">
	import type { Argument, ArgumentStance, VoteType, VoteSummary, Category } from '$lib/models/types';
	import { complexityStore } from '$lib/stores/complexity.svelte';
	import { categoriesStore } from '$lib/stores/categories.svelte';
	import { activityStore } from '$lib/stores/activity.svelte';
	import { budgetStore } from '$lib/stores/budget.svelte';
	import { getUserId, markVotedArg } from '$lib/stores/user';
	import { forkFeedStore } from '$lib/stores/fork-feed.svelte';
	import { abbreviateNumber } from '$lib/utils/format';
	import ArgumentCard from '$lib/components/ArgumentCard.svelte';
	import ForkLines from '$lib/components/ForkLines.svelte';
	import VoteRow from '$lib/components/VoteRow.svelte';
	import SwipeVote from '$lib/components/SwipeVote.svelte';
	import ActivityGraph from '$lib/components/ActivityGraph.svelte';
	import type { ActivityDay } from '$lib/stores/data';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

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
	// svelte-ignore state_referenced_locally
	let activity = $state<ActivityDay[]>(data.activity ?? []);
	// svelte-ignore state_referenced_locally
	let heatRatio = $state<number>(data.heatRatio ?? 0);

	$effect(() => {
		thesis = data.thesis;
		args = data.arguments;
		voteSummary = data.voteSummary;
		related = data.related ?? [];
		relatedMode = data.relatedMode ?? null;
		activity = data.activity ?? [];
		heatRatio = data.heatRatio ?? 0;
		// Sidebar activity is now rendered inline at the bottom of the thesis page.
		activityStore.set([], '');
		if (data.arguments && data.thesis) {
			forkFeedStore.update(data.arguments, data.thesis.title);
		}
	});

	let heat = $derived.by(() => {
		if (heatRatio >= 1.5) return 'hot';
		if (heatRatio >= 0.75) return 'warm';
		if (heatRatio > 0) return 'cool';
		return 'cold';
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

	// "Weitere Argumente": everything below the top-column cap, sorted by
	// time-weighted hot score (HN-style). Fresh but well-received arguments
	// bubble upward; stale ones sink. Once the community backs them enough,
	// they will overtake something in the top-columns naturally.
	let poolArgs = $derived.by(() => {
		const topIds = new Set<string>([
			...supportArgs.map((a) => a.id),
			...rejectArgs.map((a) => a.id)
		]);
		const now = Date.now();
		return args
			.filter((a) => !topIds.has(a.id))
			.map((a) => {
				const ageDays = Math.max(0, (now - new Date(a.meta.created_at).getTime()) / (24 * 60 * 60 * 1000));
				const score = scoreOf(a);
				// HN-style: score / (age + 2)^1.5. +2 to prevent divide-by-zero and to soften brand-new items.
				return { arg: a, hot: score / Math.pow(ageDays + 2, 1.5) };
			})
			.sort((a, b) => b.hot - a.hot)
			.map((x) => x.arg);
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
		const isCycleReset = currentVote === type && weight === 1 && currentWeight >= 3;
		const chargeable = (type === 'support' || type === 'reject') && !isCycleReset;
		if (chargeable) {
			if (!budgetStore.canAffordVotes(1)) return;
			budgetStore.spendVotes(1);
		}
		voting = true;
		try {
			const userId = getUserId();
			const res = await fetch(`/api/theses/${thesis.id}/vote`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type, weight, user_id: userId })
			});
			if (!res.ok) {
				if (chargeable) budgetStore.refundVotes(1);
				return;
			}
			const responseData = await res.json();
			voteSummary = responseData.vote_summary;
			const isRetract = currentVote === type && currentWeight === weight;
			currentVote = isRetract ? null : type;
			currentWeight = isRetract ? 1 : weight;
			hasVotedLocally = true;
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
		if (res.status === 429) return m.error_too_many_requests();
		if (res.status === 413) return m.error_text_too_long();
		if (res.status === 403) {
			const body = await res.json().catch(() => ({}));
			return body?.error ?? m.error_not_allowed();
		}
		if (res.status === 400) {
			const body = await res.json().catch(() => ({}));
			return body?.error ?? m.error_invalid_input();
		}
		return m.error_server_generic({ status: res.status });
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

	// --- Translation (session-cached) ---
	let translated = $state<{ title: string; description: string } | null>(null);
	let translating = $state(false);
	let translateNeeded = $derived.by(() => {
		if (!thesis?.lang) return false;
		if (typeof window === 'undefined') return false;
		return thesis.lang !== getLocale();
	});
	let displayTitle = $derived(translated?.title ?? thesis?.title ?? '');
	let displayDescription = $derived(translated?.description ?? thesis?.description ?? '');

	async function toggleTranslate() {
		if (!thesis) return;
		if (translated) {
			translated = null;
			return;
		}
		if (translating) return;
		translating = true;
		try {
			const target = getLocale();
			const res = await fetch(`/api/theses/${thesis.id}/translate?to=${target}`);
			if (!res.ok) return;
			const data = (await res.json()) as { title: string; description: string; target: string };
			translated = { title: data.title, description: data.description };
		} finally {
			translating = false;
		}
	}

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
		if (!confirm(newState ? m.thesis_admin_confirm_archive() : m.thesis_admin_confirm_unarchive())) return;
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
		<a href="/" class="back-link">{m.thesis_back()}</a>

		{#if thesis.archived}
			<div class="archived-banner">{m.thesis_archived_banner()}</div>
		{/if}

		<!-- Thesis tile -->
		<SwipeVote oncast={castThesisVote}>
		<div class="thesis-tile card heat-{heat} lifecycle-band-{thesis.lifecycle?.state ?? 'seedling'}">
			<span
				class="side-band heat-band"
				title="Heat: {heat} (recent activity {heatRatio.toFixed(2)}× baseline) — click for details"
				role="button"
				tabindex="0"
				aria-label="Heat: {heat} — open explanation"
				onclick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = '/about/heat'; }}
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); window.location.href = '/about/heat'; } }}
			></span>
			<span
				class="side-band lifecycle-band-strip"
				title="Lifecycle: {thesis.lifecycle?.state ?? 'seedling'} — click for details"
				role="button"
				tabindex="0"
				aria-label="Lifecycle: {thesis.lifecycle?.state ?? 'seedling'} — open explanation"
				onclick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = '/about/lifecycle'; }}
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); window.location.href = '/about/lifecycle'; } }}
			></span>
			{#if editingThesis}
				<form class="edit-form" onsubmit={(e) => { e.preventDefault(); submitEditThesis(); }}>
					<div class="form-group">
						<label for="edit-title">{m.thesis_edit_title_label()}</label>
						<input id="edit-title" type="text" bind:value={editTitle} maxlength="200" required />
					</div>
					<div class="form-group">
						<label for="edit-desc">{m.thesis_edit_desc_label()}</label>
						<textarea id="edit-desc" bind:value={editDescription} maxlength="2000" required></textarea>
					</div>
					<div class="form-group">
						<label for="edit-categories">{m.thesis_edit_categories_label()}</label>
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
							{editSubmitting ? m.thesis_edit_saving() : m.thesis_edit_save()}
						</button>
						<button class="btn" type="button" onclick={() => (editingThesis = false)}>{m.thesis_edit_cancel()}</button>
					</div>
				</form>
			{:else}
				<h1 class="thesis-title">{displayTitle}</h1>
				<p class="thesis-description">{displayDescription}</p>

				<div class="thesis-meta-row">
					{#each thesis.categories as category}
						<span class="tag">{category}</span>
					{/each}
					{#if translateNeeded}
						<button
							type="button"
							class="translate-btn"
							onclick={toggleTranslate}
							disabled={translating}
						>
							{#if translating}
								{m.translate_pending()}
							{:else if translated}
								{m.translate_show_original()}
							{:else}
								{m.translate_to({ locale: getLocale().toUpperCase() })}
							{/if}
						</button>
					{/if}
				</div>

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
					<span class="badge badge-arguments" title="Arguments">
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
						</svg>
						{abbreviateNumber(args.length)}
					</span>
					{#if isAuthor}
						<div class="thesis-admin-row">
							<button class="btn btn-sm" onclick={openEditThesis}>{m.thesis_admin_edit()}</button>
						</div>
					{/if}
				</div>
			{/if}
		</div>
		</SwipeVote>

		<section class="arguments-section">
			{#if showArgForm}
				<form class="card argument-form" onsubmit={(e) => { e.preventDefault(); submitArgument(); }}>
					<h3 class="form-title">
						{#if argFormMode === 'edit'}{m.argform_title_edit()}{:else if argFormMode === 'fork'}{m.argform_title_fork()}{:else}{m.argform_title_new()}{/if}
					</h3>

					{#if argFormMode === 'fork'}
						<p class="form-hint">{m.argform_fork_hint()}</p>
					{/if}

					{#if argFormMode !== 'edit'}
						<div class="stance-toggle">
							<button
								type="button"
								class="btn btn-sm stance-btn"
								class:stance-support={argStance === 'support'}
								onclick={() => argFormMode !== 'fork' && (argStance = 'support')}
								disabled={argFormMode === 'fork'}
							>{m.argform_stance_support()}</button>
							<button
								type="button"
								class="btn btn-sm stance-btn"
								class:stance-reject={argStance === 'reject'}
								onclick={() => argFormMode !== 'fork' && (argStance = 'reject')}
								disabled={argFormMode === 'fork'}
							>{m.argform_stance_reject()}</button>
						</div>
					{/if}

					<div class="form-group">
						<label for="arg-content">{m.argform_content_label()} <span class="hint-inline">{m.argform_content_hint()}</span></label>
						<textarea id="arg-content" bind:value={argContent} placeholder={m.argform_content_placeholder()} maxlength="800" required></textarea>
					</div>

					<label class="emotional-check">
						<input type="checkbox" bind:checked={argIsEmotional} />
						<span>{m.argform_emotional_label()} <span class="hint-inline">{m.argform_emotional_hint()}</span></span>
					</label>

					<div class="form-actions">
						<button class="btn btn-primary" type="submit" disabled={argSubmitting}>
							{#if argSubmitting}{m.argform_submitting()}{:else if argFormMode === 'edit'}{m.argform_submit_edit()}{:else if argFormMode === 'fork'}{m.argform_submit_fork()}{:else}{m.argform_submit_new()}{/if}
						</button>
						<button class="btn" type="button" onclick={cancelArgForm}>{m.argform_cancel()}</button>
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
							{m.argcol_supporting()}
							<span class="col-count">({totalSupport})</span>
						</h2>
						<button
							class="btn btn-sm add-arg-btn"
							onclick={() => openNewArg('support')}
						>{m.argcol_add_arg()}</button>
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
							<p class="col-empty">{m.argcol_empty_support()}</p>
						{/if}
					</div>
				</div>

				<div class="arguments-col col-reject">
					<div class="col-header">
						<h2 class="col-title">
							<span class="col-marker" aria-hidden="true"></span>
							{m.argcol_rejecting()}
							<span class="col-count">({totalReject})</span>
						</h2>
						<button
							class="btn btn-sm add-arg-btn"
							onclick={() => openNewArg('reject')}
						>{m.argcol_add_arg()}</button>
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
							<p class="col-empty">{m.argcol_empty_reject()}</p>
						{/if}
					</div>
				</div>
			</div>

			<section class="argument-pool">
				<header class="argument-pool-head">
					<h3 class="argument-pool-title">{m.argpool_title()}</h3>
					<p class="argument-pool-hint">{m.argpool_hint()}</p>
				</header>
				{#if poolArgs.length === 0}
					<p class="argument-pool-empty">{m.argpool_empty()}</p>
				{:else}
					<ul class="argument-pool-list">
						{#each poolArgs as arg (arg.id)}
							<li class="argument-pool-item" class:is-support={arg.stance === 'support'} class:is-reject={arg.stance === 'reject'}>
								<span class="argument-pool-stance argument-pool-stance-{arg.stance}">
									{arg.stance === 'support' ? m.argpool_stance_support() : m.argpool_stance_reject()}
								</span>
								<ArgumentCard
									argument={arg}
									forkedFromContent={forkSourceContent(arg)}
									onFork={openFork}
									onEdit={openEdit}
								/>
							</li>
						{/each}
					</ul>
				{/if}
				{#if args.length > supportArgs.length + rejectArgs.length + poolArgs.length}
					<p class="complexity-note">{m.complexity_slider_hint()}</p>
				{/if}
			</section>
		</section>

		{#if visibleRelated.length > 0}
			<aside class="related-panel">
				<div class="related-head">
					<span class="related-title">{m.related_title()}</span>
					<span class="related-mode" title={relatedMode === 'semantic' ? m.related_mode_semantic_title() : m.related_mode_thematic_title()}>
						{relatedMode === 'semantic' ? m.related_mode_semantic() : m.related_mode_thematic()}
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

		{#if activity.length > 0}
			<section class="thesis-activity card">
				<ActivityGraph
					data={activity}
					title={m.thesis_activity_title({ title: `${thesis.title.slice(0, 30)}${thesis.title.length > 30 ? '…' : ''}` })}
					height={70}
				/>
			</section>
		{/if}

		{#if isAuthor}
			<section class="danger-zone">
				<header class="danger-zone-head">
					<h3 class="danger-zone-title">{m.danger_zone_title()}</h3>
					<p class="danger-zone-hint">{m.danger_zone_hint()}</p>
				</header>
				<div class="danger-zone-row">
					<div class="danger-zone-item-info">
						<strong>{thesis.archived ? m.danger_zone_unarchive_title() : m.danger_zone_archive_title()}</strong>
						<span>{thesis.archived ? m.danger_zone_unarchive_desc() : m.danger_zone_archive_desc()}</span>
					</div>
					<button class="btn btn-danger" onclick={toggleArchive}>
						{thesis.archived ? m.thesis_admin_unarchive() : m.thesis_admin_archive()}
					</button>
				</div>
			</section>
		{/if}
	</article>
{:else}
	<div class="not-found">
		<h1>{m.not_found_thesis_title()}</h1>
		<a href="/" class="btn btn-primary">{m.not_found_back_home()}</a>
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

	/* Thesis tile — mirrors the ThesisCard visual language */
	.thesis-tile {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		background: white;
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		position: relative;
		padding-left: calc(1.5rem + 16px);
		overflow: hidden;
	}

	/* Two vertical bands on the left edge: heat (outer) and lifecycle (inner). */
	.side-band {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 8px;
		background: var(--color-border);
		transition: filter var(--transition-fast);
	}
	.heat-band {
		left: 0;
		cursor: pointer;
	}
	.lifecycle-band-strip {
		left: 8px;
		cursor: pointer;
	}
	.heat-band:hover,
	.lifecycle-band-strip:hover {
		filter: brightness(0.85);
	}

	/* Heat band */
	.thesis-tile.heat-hot  .heat-band { background: #ea580c; }
	.thesis-tile.heat-warm .heat-band { background: #f59e0b; }
	.thesis-tile.heat-cool .heat-band { background: #93c5fd; }
	.thesis-tile.heat-cold .heat-band { background: #3b82f6; }

	/* Lifecycle band */
	.thesis-tile.lifecycle-band-seedling     .lifecycle-band-strip { background: #bef264; }
	.thesis-tile.lifecycle-band-discussed    .lifecycle-band-strip { background: #93c5fd; }
	.thesis-tile.lifecycle-band-contested    .lifecycle-band-strip { background: #fbbf24; }
	.thesis-tile.lifecycle-band-crystallized .lifecycle-band-strip { background: #67e8f9; }
	.thesis-tile.lifecycle-band-faded        .lifecycle-band-strip { background: #d4d4d8; }
	.thesis-tile.lifecycle-band-dormant      .lifecycle-band-strip { background: #a1a1aa; }

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

	.thesis-activity {
		padding: 0.75rem 1rem;
	}

	/* Danger zone (bottom of the page, author-only) */
	.danger-zone {
		border: 1px solid var(--color-reject);
		border-radius: var(--radius-lg);
		padding: 1rem 1.25rem;
		background: var(--color-reject-bg);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.danger-zone-head {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.danger-zone-title {
		font-size: var(--text-base);
		font-weight: 700;
		color: var(--color-reject);
		margin: 0;
	}

	.danger-zone-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: 0;
	}

	.danger-zone-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem;
		border-radius: var(--radius-md);
		background: white;
		border: 1px solid var(--color-reject);
	}

	.danger-zone-item-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-size: var(--text-sm);
	}
	.danger-zone-item-info strong {
		color: var(--color-text);
	}
	.danger-zone-item-info span {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.btn-danger {
		background: var(--color-reject);
		color: white;
		border: 1px solid var(--color-reject);
	}
	.btn-danger:hover {
		filter: brightness(0.92);
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

	.translate-btn {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.6rem;
		font-size: var(--text-xs);
		font-weight: 500;
		border-radius: var(--radius-sm);
		background: var(--color-primary-bg);
		color: var(--color-primary);
		border: 1px solid var(--color-primary-bg);
		font-family: inherit;
		cursor: pointer;
		transition: filter var(--transition-fast);
	}

	.translate-btn:hover:not(:disabled) {
		filter: brightness(0.95);
	}

	.translate-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

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

	/* Argument pool (below the top columns) */
	.argument-pool {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding-top: 1rem;
		border-top: 1px dashed var(--color-border);
	}

	.argument-pool-head {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.argument-pool-title {
		font-size: var(--text-base);
		font-weight: 600;
		margin: 0;
		color: var(--color-text-muted);
	}

	.argument-pool-hint {
		font-size: var(--text-xs);
		color: var(--color-text-light);
		margin: 0;
	}

	.argument-pool-empty {
		font-size: var(--text-sm);
		color: var(--color-text-light);
		text-align: center;
		padding: 1rem;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		margin: 0;
	}

	.complexity-note {
		text-align: center;
		font-size: var(--text-xs);
		color: var(--color-text-light);
		font-style: italic;
		margin: 0.5rem 0 0;
	}

	.argument-pool-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.75rem;
	}

	.argument-pool-item {
		position: relative;
	}

	.argument-pool-item.is-support :global(.argument-card) {
		border-left: 3px solid var(--color-support);
	}
	.argument-pool-item.is-reject :global(.argument-card) {
		border-left: 3px solid var(--color-reject);
	}

	.argument-pool-stance {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		z-index: 2;
		font-size: 0.6rem;
		font-family: var(--font-mono);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0.1rem 0.4rem;
		border-radius: 9999px;
		border: 1px solid transparent;
	}
	.argument-pool-stance-support {
		background: var(--color-support-bg);
		color: var(--color-support);
		border-color: var(--color-support);
	}
	.argument-pool-stance-reject {
		background: var(--color-reject-bg);
		color: var(--color-reject);
		border-color: var(--color-reject);
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
