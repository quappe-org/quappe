<script lang="ts">
	import type { PulseBody } from '$lib/server/pulse';
	import type { ActivityDay } from '$lib/stores/data';
	import { complexityStore } from '$lib/stores/complexity.svelte';
	import { m } from '$lib/paraglide/messages';
	import ActivityGraph from '$lib/components/ActivityGraph.svelte';

	let { data } = $props();

	let activity = $derived<ActivityDay[]>(data.activity ?? []);

	interface PulseResponse extends PulseBody {
		cached?: boolean;
	}

	// svelte-ignore state_referenced_locally
	let pulse = $state<PulseResponse | null>(data.pulse as PulseResponse | null);
	// svelte-ignore state_referenced_locally
	let loadError = $state<string | null>(data.error);
	let refreshing = $state(false);

	async function refresh() {
		refreshing = true;
		loadError = null;
		try {
			const res = await fetch('/api/reports/pulse?force=true');
			if (!res.ok) {
				loadError = m.pulse_server_error({ status: res.status });
				return;
			}
			pulse = await res.json();
		} catch (err) {
			loadError = (err as Error)?.message ?? m.pulse_unknown_error();
		} finally {
			refreshing = false;
		}
	}

	let paragraphs = $derived(pulse?.text ? pulse.text.split(/\n\n+/) : []);

	// Complexity cap: slider controls how many items each column shows.
	// Server delivers max 5 — we take min(5, complexity.max_theses).
	let displayLimit = $derived(Math.min(5, complexityStore.settings.max_theses));

	let hotDisplay = $derived(pulse?.stats.hot_theses.slice(0, displayLimit) ?? []);
	let complexDisplay = $derived(pulse?.stats.complex_theses.slice(0, displayLimit) ?? []);
	let catDisplay = $derived(pulse?.stats.driving_categories.slice(0, displayLimit) ?? []);
	let allEmpty = $derived(hotDisplay.length === 0 && complexDisplay.length === 0 && catDisplay.length === 0);
</script>

<section class="pulse-page">
	<div class="page-head">
		<h1 class="page-title">{m.pulse_page_title()}</h1>
		<p class="page-subtitle">{m.pulse_page_subtitle()}</p>
	</div>

	{#if loadError && !pulse}
		<p class="pulse-error">{loadError}</p>
	{/if}

	{#if pulse}
		<article class="pulse-report card">
			{#if pulse.llm && !pulse.llm.ok}
				<div class="pulse-llm-error">
					<p>{m.pulse_llm_unavailable({ error: pulse.llm.error ?? '' })}</p>
					{#if pulse.llm.hint}<p class="pulse-hint">{pulse.llm.hint}</p>{/if}
				</div>
			{:else if paragraphs.length > 0}
				<div class="pulse-text">
					{#each paragraphs as para}
						<p>{para}</p>
					{/each}
				</div>
			{:else}
				<p class="pulse-status">{m.pulse_no_text()}</p>
			{/if}

			<div class="pulse-meta">
				{pulse.cached ? m.pulse_cached() : m.pulse_fresh()}{#if pulse.llm?.model} · {pulse.llm.model}{/if} ·
				<time datetime={pulse.generated_at}>{new Date(pulse.generated_at).toLocaleString()}</time>
				<button class="btn btn-sm pulse-refresh" onclick={refresh} disabled={refreshing}>
					{refreshing ? m.pulse_refreshing() : m.pulse_regenerate()}
				</button>
			</div>
		</article>

		<div class="pulse-summary">
			<div class="pulse-summary-item">
				<span class="pulse-summary-num">{pulse.stats.total_theses}</span>
				<span class="pulse-summary-label">{m.pulse_summary_theses()}</span>
			</div>
			<div class="pulse-summary-item">
				<span class="pulse-summary-num">{pulse.stats.total_arguments}</span>
				<span class="pulse-summary-label">{m.pulse_summary_arguments()}</span>
			</div>
			<div class="pulse-summary-item">
				<span class="pulse-summary-num">{pulse.stats.recent_week.new_theses}</span>
				<span class="pulse-summary-label">{m.pulse_summary_new_week()}</span>
			</div>
		</div>

		{#if activity.length > 0}
			<div class="pulse-activity card">
				<ActivityGraph data={activity} title={m.my_platform_activity()} height={80} />
			</div>
		{/if}

		<div class="pulse-columns">
			<section class="pulse-col card pulse-col-hot">
				<header class="pulse-col-head">
					<span class="pulse-col-dot pulse-dot-hot" aria-hidden="true"></span>
					<h2 class="pulse-col-title">{m.pulse_col_hot_title()}</h2>
				</header>
				{#if hotDisplay.length === 0}
					<p class="pulse-col-empty">{m.pulse_col_empty()}</p>
				{:else}
					<ol class="pulse-col-list">
						{#each hotDisplay as t, i}
							<li class="pulse-col-item">
								<span class="pulse-col-rank">{i + 1}</span>
								<div class="pulse-col-body">
									<a href="/thesis/{t.id}" class="pulse-col-link">{t.title}</a>
									<span class="pulse-col-metric">{m.pulse_hot_metric({ heat: t.heat.toFixed(2), args: t.arguments })}</span>
								</div>
							</li>
						{/each}
					</ol>
				{/if}
			</section>

			<section class="pulse-col card pulse-col-complex">
				<header class="pulse-col-head">
					<span class="pulse-col-dot pulse-dot-complex" aria-hidden="true"></span>
					<h2 class="pulse-col-title">{m.pulse_col_complex_title()}</h2>
				</header>
				{#if complexDisplay.length === 0}
					<p class="pulse-col-empty">{m.pulse_col_empty()}</p>
				{:else}
					<ol class="pulse-col-list">
						{#each complexDisplay as t, i}
							<li class="pulse-col-item">
								<span class="pulse-col-rank">{i + 1}</span>
								<div class="pulse-col-body">
									<a href="/thesis/{t.id}" class="pulse-col-link">{t.title}</a>
									<span class="pulse-col-metric">{m.pulse_complex_metric({ args: t.arguments })}</span>
								</div>
							</li>
						{/each}
					</ol>
				{/if}
			</section>

			<section class="pulse-col card pulse-col-cat">
				<header class="pulse-col-head">
					<span class="pulse-col-dot pulse-dot-cat" aria-hidden="true"></span>
					<h2 class="pulse-col-title">{m.pulse_col_categories_title()}</h2>
				</header>
				{#if catDisplay.length === 0}
					<p class="pulse-col-empty">{m.pulse_col_empty()}</p>
				{:else}
					<ol class="pulse-col-list">
						{#each catDisplay as c, i}
							<li class="pulse-col-item">
								<span class="pulse-col-rank">{i + 1}</span>
								<div class="pulse-col-body">
									<span class="pulse-col-link pulse-col-link-plain">{c.name}</span>
									<span class="pulse-col-metric">{m.pulse_cat_metric({ theses: c.thesis_count, args: c.argument_count, pct: Math.round(c.avg_support_ratio * 100) })}</span>
								</div>
							</li>
						{/each}
					</ol>
				{/if}
			</section>
		</div>

		{#if allEmpty}
			<p class="pulse-empty-all">{m.pulse_empty_all()}</p>
		{/if}
	{/if}
</section>

<style>
	.pulse-page {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.pulse-page :global(.card) {
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

	.pulse-report {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.pulse-text {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.pulse-text p {
		margin: 0;
		font-size: var(--text-base);
		line-height: 1.6;
	}

	.pulse-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--text-xs);
		color: var(--color-text-light);
		font-family: var(--font-mono);
		padding-top: 0.4rem;
		border-top: 1px dashed var(--color-border);
	}

	.pulse-refresh {
		margin-left: auto;
	}

	.pulse-llm-error {
		background: var(--color-reject-bg);
		border: 1px solid var(--color-reject);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.75rem;
		color: var(--color-reject);
		font-size: var(--text-sm);
	}

	.pulse-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: 0.25rem 0 0;
	}

	.pulse-error {
		background: var(--color-reject-bg);
		border: 1px solid var(--color-reject);
		border-radius: var(--radius-md);
		padding: 0.75rem 1rem;
		color: var(--color-reject);
		font-size: var(--text-sm);
	}

	.pulse-status {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		margin: 0;
	}

	.pulse-summary {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 0.5rem;
		padding: 0.6rem 0.9rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}

	.pulse-summary-item {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.pulse-summary-num {
		font-size: var(--text-2xl);
		font-weight: 700;
		font-family: var(--font-mono);
		color: var(--color-text);
	}

	.pulse-summary-label {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.pulse-activity {
		padding: 0.75rem 0.9rem;
	}

	.pulse-columns {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
	}

	@media (max-width: 900px) {
		.pulse-columns {
			grid-template-columns: 1fr;
		}
	}

	.pulse-col {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 0.9rem;
	}

	.pulse-col-head {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--color-border);
	}

	.pulse-col-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.pulse-dot-hot {
		background: #fbbf24;
	}

	.pulse-dot-complex {
		background: #22d3ee;
	}

	.pulse-dot-cat {
		background: var(--color-text-muted);
	}

	.pulse-col-title {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.pulse-col-empty {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: 0;
	}

	.pulse-col-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.pulse-col-item {
		display: grid;
		grid-template-columns: 1.5rem 1fr;
		gap: 0.4rem;
		align-items: baseline;
	}

	.pulse-col-rank {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--color-text-light);
		text-align: right;
	}

	.pulse-col-body {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}

	.pulse-col-link {
		font-size: var(--text-sm);
		color: var(--color-text);
		text-decoration: none;
		line-height: 1.35;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.pulse-col-link:hover {
		color: var(--color-primary);
	}

	.pulse-col-link-plain {
		color: var(--color-text);
		-webkit-line-clamp: 1;
		line-clamp: 1;
	}

	.pulse-col-metric {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-text-light);
	}

	.pulse-empty-all {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		margin: 0;
		text-align: center;
		padding: 1rem;
	}
</style>
