<script lang="ts">
	import { updatesStore, type UpdateEvent } from '$lib/stores/updates.svelte';
	import { updatesSeen } from '$lib/stores/updates-seen.svelte';
	import { forkFeedStore, type ForkDecision } from '$lib/stores/fork-feed.svelte';
	import { complexityStore } from '$lib/stores/complexity.svelte';
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	let mounted = $state(false);

	onMount(() => {
		mounted = true;
		updatesStore.refresh().then(() => {
			updatesSeen.markAllSeen();
		});
	});

	let cap = $derived(complexityStore.settings.max_theses * 3);

	// Fork decisions come from two sources:
	// 1. Server-side fork events (from the updates API, within 7-day window)
	// 2. Client-side pending forks (from forkFeedStore, detected when visiting thesis pages)
	// Merge them, deduplicating by original+fork ID pair.
	interface ForkCard {
		key: string;
		thesis_id: string;
		thesis_title: string;
		original_id: string;
		original_content: string;
		original_votes: number;
		fork_id: string;
		fork_content: string;
		fork_votes: number;
		at: string;
	}

	let forkCards = $derived.by(() => {
		const seen = new Set<string>();
		const cards: ForkCard[] = [];

		// Server-side fork events first (they have vote counts)
		for (const e of updatesStore.events) {
			if (e.kind !== 'fork') continue;
			if (!e.original_argument_id || !e.fork_argument_id) continue;
			const key = `${e.original_argument_id}::${e.fork_argument_id}`;
			if (seen.has(key)) continue;
			// Skip decisions the user has already made (covers server-sourced
			// cards too, which aren't in forkFeedStore.pending).
			if (forkFeedStore.isDecided(e.original_argument_id, e.fork_argument_id)) continue;
			seen.add(key);
			cards.push({
				key,
				thesis_id: e.thesis_id,
				thesis_title: e.thesis_title,
				original_id: e.original_argument_id,
				original_content: e.original_content ?? '',
				original_votes: e.original_votes ?? 0,
				fork_id: e.fork_argument_id,
				fork_content: e.fork_content ?? '',
				fork_votes: e.fork_votes ?? 0,
				at: e.at
			});
		}

		// Client-side pending forks (no vote counts available)
		for (const p of forkFeedStore.pending) {
			const key = `${p.original_id}::${p.fork_id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			cards.push({
				key,
				thesis_id: p.thesis_id,
				thesis_title: p.thesis_title,
				original_id: p.original_id,
				original_content: p.original_content,
				original_votes: 0,
				fork_id: p.fork_id,
				fork_content: p.fork_content,
				fork_votes: 0,
				at: ''
			});
		}

		return cards;
	});

	let otherEvents = $derived(updatesStore.events.filter((e) => e.kind !== 'fork').slice(0, cap));
	let isCapped = $derived(updatesStore.events.filter((e) => e.kind !== 'fork').length > otherEvents.length);
	let hasContent = $derived(forkCards.length > 0 || otherEvents.length > 0);

	function typeLabel(kind: UpdateEvent['kind']): string {
		if (kind === 'fork') return m.updates_type_fork();
		if (kind === 'new_argument') return m.updates_type_newarg();
		return m.updates_type_lifecycle();
	}

	function fmtTime(iso: string): string {
		if (!iso) return '';
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
		if (e.kind === 'new_argument') return 'a_' + e.argument_id;
		return 'l_' + e.thesis_id + '_' + e.at + '_' + idx;
	}

	function handleKeepOriginal(card: ForkCard) {
		// Keep the vote where it is (on the original). Just record the decision
		// so the card stops surfacing.
		forkFeedStore.resolve(card.original_id, card.fork_id);
	}

	async function handleSwitchToFork(card: ForkCard) {
		// Record the decision immediately for instant UI feedback…
		forkFeedStore.resolve(card.original_id, card.fork_id);
		// …then migrate the user's support to the fork. The server enforces one
		// vote per fork group, so a support vote here moves it off the original.
		try {
			await fetch(`/api/arguments/${card.fork_id}/vote`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: 'support', weight: 1 })
			});
		} catch {
			// non-fatal — the decision is already recorded
		}
	}

	// Carousel state for fork cards — kept in range as cards resolve away.
	let forkIndex = $state(0);
	$effect(() => {
		if (forkIndex > forkCards.length - 1) forkIndex = Math.max(0, forkCards.length - 1);
	});
</script>

<section class="updates-page">
	<div class="page-head">
		<h1 class="page-title">{m.updates_page_title()}</h1>
		<p class="page-subtitle">{m.updates_page_subtitle()}</p>
	</div>

	{#if updatesStore.loading && updatesStore.events.length === 0 && forkFeedStore.pending.length === 0}
		<p class="updates-status">{m.updates_loading()}</p>
	{:else if mounted && !hasContent}
		<div class="updates-empty card">
			<p><strong>{m.updates_empty_head()}</strong></p>
			<p>{m.updates_empty_body()}</p>
		</div>
	{:else if mounted}

		<!-- FORK DECISIONS: carousel at top -->
		{#if forkCards.length > 0}
			{@const card = forkCards[forkIndex]}
			{@const forkLeads = card.fork_votes > card.original_votes}
			<div class="fork-section">
				<div class="fork-section-header">
					<h2 class="fork-section-title">{m.updates_type_fork()}</h2>
					{#if forkCards.length > 1}
						<span class="fork-counter">{forkIndex + 1} / {forkCards.length}</span>
					{/if}
				</div>

				<div class="fork-carousel">
					{#if forkCards.length > 1}
						<button
							class="fork-nav fork-nav-prev"
							disabled={forkIndex === 0}
							onclick={() => forkIndex--}
							aria-label="Previous"
						>&lsaquo;</button>
					{/if}

					<div class="fork-card card" class:updates-new={card.at ? updatesSeen.isNew(card.at) : true}>
						<div class="fork-card-header">
							<a class="fork-thesis-link" href="/thesis/{card.thesis_id}">{card.thesis_title}</a>
							{#if card.at}
								<time class="updates-time">{fmtTime(card.at)}</time>
							{/if}
						</div>

						<div class="fork-candidates">
							{#if forkLeads}
								<div class="fork-candidate fork-candidate-leader">
									<span class="fork-label fork-label-new">Fork</span>
									<p class="fork-candidate-text">{card.fork_content}</p>
									{#if card.fork_votes > 0 || card.original_votes > 0}
										<span class="fork-votes">{card.fork_votes}</span>
									{/if}
								</div>
								<div class="fork-candidate fork-candidate-trailing">
									<span class="fork-label fork-label-original">Original</span>
									<p class="fork-candidate-text">{card.original_content}</p>
									{#if card.fork_votes > 0 || card.original_votes > 0}
										<span class="fork-votes">{card.original_votes}</span>
									{/if}
								</div>
							{:else}
								<div class="fork-candidate fork-candidate-leader">
									<span class="fork-label fork-label-original">Original</span>
									<p class="fork-candidate-text">{card.original_content}</p>
									{#if card.fork_votes > 0 || card.original_votes > 0}
										<span class="fork-votes">{card.original_votes}</span>
									{/if}
								</div>
								<div class="fork-candidate fork-candidate-trailing">
									<span class="fork-label fork-label-new">Fork</span>
									<p class="fork-candidate-text">{card.fork_content}</p>
									{#if card.fork_votes > 0 || card.original_votes > 0}
										<span class="fork-votes">{card.fork_votes}</span>
									{/if}
								</div>
							{/if}
						</div>

						<div class="fork-actions">
							<button
								class="fork-action-btn"
								onclick={() => handleKeepOriginal(card)}
							>{m.panel_fork_updates_keep_old()}</button>
							<button
								class="fork-action-btn fork-action-switch"
								onclick={() => handleSwitchToFork(card)}
							>{m.panel_fork_updates_switch_new()}</button>
						</div>
					</div>

					{#if forkCards.length > 1}
						<button
							class="fork-nav fork-nav-next"
							disabled={forkIndex >= forkCards.length - 1}
							onclick={() => forkIndex++}
							aria-label="Next"
						>&rsaquo;</button>
					{/if}
				</div>

				{#if forkCards.length > 1}
					<div class="fork-dots">
						{#each forkCards as _, idx}
							<button
								class="fork-dot"
								class:fork-dot-active={idx === forkIndex}
								onclick={() => forkIndex = idx}
								aria-label="Go to fork {idx + 1}"
							></button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- OTHER EVENTS: normal chronological stream -->
		{#if otherEvents.length > 0}
			<ul class="updates-list">
				{#each otherEvents as e, i (eventKey(e, i))}
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

						{#if e.kind === 'new_argument'}
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
	{/if}
</section>

<style>
	.updates-page {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.updates-page :global(.card) {
		padding: 0.75rem 1rem;
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

	/* ---- Fork section (carousel) ---- */
	.fork-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.fork-section-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}

	.fork-section-title {
		font-size: var(--text-sm);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #9a3412;
		margin: 0;
	}

	.fork-counter {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		font-family: var(--font-mono);
	}

	.fork-carousel {
		display: flex;
		align-items: stretch;
		gap: 0.4rem;
	}

	.fork-nav {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.8rem;
		flex-shrink: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		color: var(--color-text);
		font-size: 1.2rem;
		cursor: pointer;
		transition: background var(--transition-base);
	}

	.fork-nav:hover:not(:disabled) {
		background: var(--color-border);
	}

	.fork-nav:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.fork-dots {
		display: flex;
		justify-content: center;
		gap: 0.35rem;
	}

	.fork-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		border: none;
		background: var(--color-border);
		cursor: pointer;
		padding: 0;
		transition: background var(--transition-base);
	}

	.fork-dot-active {
		background: #f97316;
	}

	.fork-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border-color: #fed7aa;
		background: #fffbf7;
		flex: 1;
		min-width: 0;
	}

	.fork-card.updates-new {
		border-color: #f97316;
	}

	.fork-card-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.fork-thesis-link {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.fork-thesis-link:hover {
		color: var(--color-primary);
	}

	.fork-candidates {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.fork-candidate {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
	}

	.fork-candidate-leader {
		background: var(--color-bg);
	}

	.fork-candidate-trailing {
		background: var(--color-surface);
		opacity: 0.8;
	}

	.fork-label {
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		flex-shrink: 0;
		padding: 0.1rem 0.3rem;
		border-radius: var(--radius-sm);
	}

	.fork-label-original {
		background: var(--color-surface);
		color: var(--color-text-muted);
	}

	.fork-label-new {
		background: #ecfdf5;
		color: #059669;
	}

	.fork-candidate-text {
		margin: 0;
		font-size: var(--text-xs);
		line-height: 1.4;
		color: var(--color-text);
		flex: 1;
		min-width: 0;
	}

	.fork-votes {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--color-text-light);
		flex-shrink: 0;
		font-family: var(--font-mono);
	}

	.fork-actions {
		display: flex;
		gap: 0.5rem;
	}

	.fork-action-btn {
		flex: 1;
		font-size: var(--text-xs);
		padding: 0.3rem 0.5rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-text);
		cursor: pointer;
		text-align: center;
		transition: background var(--transition-base), border-color var(--transition-base);
	}

	.fork-action-btn:hover {
		background: var(--color-border);
	}

	.fork-action-switch {
		background: #ecfdf5;
		border-color: #6ee7b7;
		color: #059669;
		font-weight: 600;
	}

	.fork-action-switch:hover {
		background: #059669;
		border-color: #059669;
		color: white;
	}

	/* ---- Updates stream ---- */
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
	.updates-content-muted {
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

	.complexity-note {
		text-align: center;
		font-size: var(--text-xs);
		color: var(--color-text-light);
		font-style: italic;
		margin: 0.25rem 0 0;
	}
</style>
