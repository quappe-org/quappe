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

	let cap = $derived(complexityStore.settings.max_theses);

	let forks = $derived(updatesStore.events.filter((e) => e.kind === 'fork').slice(0, cap));
	let newArgs = $derived(
		updatesStore.events.filter((e) => e.kind === 'new_argument').slice(0, cap)
	);
	let lifecycles = $derived(
		updatesStore.events.filter((e) => e.kind === 'lifecycle').slice(0, cap)
	);

	let isCapped = $derived(
		updatesStore.events.filter((e) => e.kind === 'fork').length > forks.length ||
			updatesStore.events.filter((e) => e.kind === 'new_argument').length > newArgs.length ||
			updatesStore.events.filter((e) => e.kind === 'lifecycle').length > lifecycles.length
	);

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
		<div class="updates-grid">
			<section class="updates-col card">
				<header class="updates-col-head">
					<span class="updates-col-dot updates-dot-fork" aria-hidden="true"></span>
					<h2 class="updates-col-title">{m.updates_col_forks_title()}</h2>
					<span class="updates-col-count">{forks.length}</span>
				</header>
				{#if forks.length === 0}
					<p class="updates-col-empty">{m.updates_col_empty()}</p>
				{:else}
					<ul class="updates-list">
						{#each forks as e (e.fork_argument_id)}
							<li class="updates-item" class:updates-new={updatesSeen.isNew(e.at)}>
								<div class="updates-item-row">
									<time class="updates-time">{fmtTime(e.at)}</time>
									<a class="updates-thesis" href="/thesis/{e.thesis_id}">{e.thesis_title}</a>
								</div>
								<p class="updates-content-old">{m.updates_fork_original_label({ content: e.original_content ?? '' })}</p>
								<p class="updates-content-new">{m.updates_fork_new_label({ content: e.fork_content ?? '' })}</p>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="updates-col card">
				<header class="updates-col-head">
					<span class="updates-col-dot updates-dot-newarg" aria-hidden="true"></span>
					<h2 class="updates-col-title">{m.updates_col_newargs_title()}</h2>
					<span class="updates-col-count">{newArgs.length}</span>
				</header>
				{#if newArgs.length === 0}
					<p class="updates-col-empty">{m.updates_col_empty()}</p>
				{:else}
					<ul class="updates-list">
						{#each newArgs as e (e.argument_id)}
							<li class="updates-item" class:updates-new={updatesSeen.isNew(e.at)}>
								<div class="updates-item-row">
									<time class="updates-time">{fmtTime(e.at)}</time>
									<span class="updates-stance updates-stance-{e.argument_stance}">
										{e.argument_stance === 'support' ? m.updates_stance_pro() : m.updates_stance_con()}
									</span>
									<a class="updates-thesis" href="/thesis/{e.thesis_id}">{e.thesis_title}</a>
								</div>
								<p class="updates-content">{e.argument_content}</p>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="updates-col card">
				<header class="updates-col-head">
					<span class="updates-col-dot updates-dot-lifecycle" aria-hidden="true"></span>
					<h2 class="updates-col-title">{m.updates_col_lifecycle_title()}</h2>
					<span class="updates-col-count">{lifecycles.length}</span>
				</header>
				{#if lifecycles.length === 0}
					<p class="updates-col-empty">{m.updates_col_empty()}</p>
				{:else}
					<ul class="updates-list">
						{#each lifecycles as e, i (e.thesis_id + '_' + e.at + '_' + i)}
							<li class="updates-item" class:updates-new={updatesSeen.isNew(e.at)}>
								<div class="updates-item-row">
									<time class="updates-time">{fmtTime(e.at)}</time>
									<span class="updates-lifecycle-state">{e.lifecycle_state}</span>
									<a class="updates-thesis" href="/thesis/{e.thesis_id}">{e.thesis_title}</a>
								</div>
								<p class="updates-content-muted">{m.updates_lifecycle_now({ state: e.lifecycle_state ?? '' })}</p>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>
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
		padding: 0.9rem 1rem;
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

	.updates-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
	}

	@media (max-width: 900px) {
		.updates-grid {
			grid-template-columns: 1fr;
		}
	}

	.updates-col {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.updates-col-head {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--color-border);
	}

	.updates-col-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.updates-dot-fork { background: #f97316; }
	.updates-dot-newarg { background: var(--color-primary); }
	.updates-dot-lifecycle { background: #a78bfa; }

	.updates-col-title {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.updates-col-count {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--color-text-light);
	}

	.updates-col-empty {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: 0;
	}

	.updates-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.updates-item {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.4rem 0.5rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		position: relative;
	}

	.updates-item.updates-new::before {
		content: '';
		position: absolute;
		left: -3px;
		top: 0.5rem;
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
		gap: 0.4rem;
		flex-wrap: wrap;
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
