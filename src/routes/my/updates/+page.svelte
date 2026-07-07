<script lang="ts">
	import { updatesStore, type UpdateEvent } from '$lib/stores/updates.svelte';
	import { updatesSeen } from '$lib/stores/updates-seen.svelte';
	import { complexityStore } from '$lib/stores/complexity.svelte';
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	let mounted = $state(false);

	onMount(() => {
		mounted = true;
		// Fresh fetch on page open, then mark seen so the badge clears.
		updatesStore.refresh().then(() => {
			updatesSeen.markAllSeen();
		});
	});

	// One combined list; the store already returns events sorted by `at` desc.
	// Cap total shown by the complexity slider — each kind still gets a fair
	// share, but the whole feed is a single chronological stream.
	let cap = $derived(complexityStore.settings.max_theses * 3);
	let visibleEvents = $derived(updatesStore.events.slice(0, cap));
	let isCapped = $derived(updatesStore.events.length > visibleEvents.length);

	function typeLabel(kind: UpdateEvent['kind']): string {
		if (kind === 'fork') return m.updates_type_fork();
		if (kind === 'new_argument') return m.updates_type_newarg();
		return m.updates_type_lifecycle();
	}

	function fmtTime(iso: string): string {
		try {
			const d = new Date(iso);
			const today = new Date();
			const sameDay =
				d.getFullYear() === today.getFullYear() &&
				d.getMonth() === today.getMonth() &&
				d.getDate() === today.getDate();
			return sameDay
				? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
				: d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
		} catch {
			return iso;
		}
	}

	function eventKey(e: UpdateEvent, idx: number): string {
		if (e.kind === 'fork') return 'f_' + e.fork_argument_id;
		if (e.kind === 'new_argument') return 'a_' + e.argument_id;
		return 'l_' + e.thesis_id + '_' + e.at + '_' + idx;
	}
</script>

<section class="updates-page">
	<div class="page-head">
		<h1 class="page-title">{m.updates_page_title()}</h1>
		<p class="page-subtitle">{m.updates_page_subtitle()}</p>
	</div>

	{#if updatesStore.loading && updatesStore.events.length === 0}
		<p class="updates-status">{m.updates_loading()}</p>
	{:else if mounted && updatesStore.events.length === 0}
		<div class="updates-empty card">
			<p><strong>{m.updates_empty_head()}</strong></p>
			<p>{m.updates_empty_body()}</p>
		</div>
	{:else if mounted}
		<ul class="updates-list">
			{#each visibleEvents as e, i (eventKey(e, i))}
				<li class="updates-item card" class:updates-new={updatesSeen.isNew(e.at)}>
					<div class="updates-item-row">
						<span class="updates-type updates-type-{e.kind}">{typeLabel(e.kind)}</span>
						<time class="updates-time">{fmtTime(e.at)}</time>
						{#if e.kind === 'new_argument' && e.argument_stance}
							<span class="updates-stance updates-stance-{e.argument_stance}">
								{e.argument_stance === 'support' ? m.updates_stance_pro() : m.updates_stance_con()}
							</span>
						{/if}
						{#if e.kind === 'lifecycle' && e.lifecycle_state}
							<span class="updates-lifecycle-state">{e.lifecycle_state}</span>
						{/if}
						<a class="updates-thesis" href="/thesis/{e.thesis_id}">{e.thesis_title}</a>
					</div>

					{#if e.kind === 'fork'}
						<p class="updates-content-old">{m.updates_fork_original_label({ content: e.original_content ?? '' })}</p>
						<p class="updates-content-new">{m.updates_fork_new_label({ content: e.fork_content ?? '' })}</p>
					{:else if e.kind === 'new_argument'}
						<p class="updates-content">{e.argument_content}</p>
					{:else if e.kind === 'lifecycle'}
						<p class="updates-content-muted">{m.updates_lifecycle_now({ state: e.lifecycle_state ?? '' })}</p>
					{/if}
				</li>
			{/each}
		</ul>
		{#if isCapped}
			<p class="complexity-note">{m.complexity_slider_hint()}</p>
		{/if}
	{/if}
</section>

<style>
	.updates-page {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.updates-page :global(.card) {
		padding: 0.7rem 0.9rem;
	}

	.page-head {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin-bottom: 0.1rem;
	}

	.page-title {
		font-size: var(--text-2xl);
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}

	.page-subtitle {
		color: var(--color-text-muted);
		font-size: var(--text-base);
		margin: 0;
	}

	.updates-status {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.updates-empty {
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.updates-empty p:first-child {
		font-size: var(--text-base);
	}

	.updates-empty p:last-child {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.updates-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.updates-item {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		position: relative;
		transition: opacity var(--transition-base);
	}

	/* Read items fade slightly so unread ones catch the eye first. */
	.updates-item:not(.updates-new) {
		opacity: 0.72;
	}

	.updates-item.updates-new::before {
		content: '';
		position: absolute;
		left: -3px;
		top: 0.9rem;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-primary);
	}

	.updates-item.updates-new {
		border-color: var(--color-primary-bg);
	}

	.updates-item-row {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		flex-wrap: wrap;
	}

	.updates-type {
		display: inline-block;
		padding: 0.08rem 0.45rem;
		font-size: 0.65rem;
		font-weight: 700;
		border-radius: var(--radius-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		flex-shrink: 0;
	}

	.updates-type-fork {
		background: #ffedd5;
		color: #9a3412;
	}

	.updates-type-new_argument {
		background: var(--color-primary-bg);
		color: var(--color-primary);
	}

	.updates-type-lifecycle {
		background: #ede9fe;
		color: #5b21b6;
	}

	.updates-time {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--color-text-light);
		flex-shrink: 0;
	}

	.updates-thesis {
		font-size: var(--text-sm);
		color: var(--color-text);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		flex: 1;
	}

	.updates-thesis:hover {
		color: var(--color-primary);
	}

	.updates-stance {
		display: inline-block;
		padding: 0.05rem 0.35rem;
		font-size: 0.65rem;
		font-weight: 600;
		border-radius: var(--radius-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.updates-stance-support {
		background: var(--color-support-bg);
		color: var(--color-support);
	}

	.updates-stance-reject {
		background: var(--color-reject-bg);
		color: var(--color-reject);
	}

	.updates-lifecycle-state {
		display: inline-block;
		padding: 0.05rem 0.35rem;
		font-size: 0.65rem;
		font-weight: 600;
		border-radius: var(--radius-sm);
		text-transform: capitalize;
		background: #ede9fe;
		color: #5b21b6;
	}

	.updates-content,
	.updates-content-muted,
	.updates-content-old,
	.updates-content-new {
		margin: 0;
		font-size: var(--text-xs);
		line-height: 1.4;
	}

	.updates-content {
		color: var(--color-text);
	}

	.updates-content-muted {
		color: var(--color-text-muted);
	}

	.updates-content-old {
		color: var(--color-text-muted);
		text-decoration: line-through;
		opacity: 0.75;
	}

	.updates-content-new {
		color: var(--color-text);
		font-weight: 500;
	}

	.complexity-note {
		text-align: center;
		font-size: var(--text-xs);
		color: var(--color-text-light);
		font-style: italic;
		margin: 0.25rem 0 0;
	}
</style>
