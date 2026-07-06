<script lang="ts">
	import type { Thesis } from '$lib/models/types';
	import { getUserId } from '$lib/stores/user';
	import { activityStore } from '$lib/stores/activity.svelte';
	import ThesisCard from '$lib/components/ThesisCard.svelte';
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	let allTheses = $state<Thesis[]>(data.theses ?? []);
	// svelte-ignore state_referenced_locally
	let heat = $state<Record<string, number>>(data.heat ?? {});
	// svelte-ignore state_referenced_locally
	let argumentCounts = $state<Record<string, number>>(data.argumentCounts ?? {});
	$effect(() => {
		allTheses = data.theses;
		heat = data.heat ?? {};
		argumentCounts = data.argumentCounts ?? {};
		activityStore.set(data.activity ?? [], m.my_platform_activity());
	});

	let myTheses = $derived.by(() => {
		if (typeof window === 'undefined') return [];
		const userId = getUserId();
		return allTheses.filter(
			(t) => t.meta.author_id === userId || t.votes.some((v) => v.user_id === userId)
		);
	});

	// ---- Standpoint report ----
	interface ReportBody {
		text: string | null;
		stats?: {
			theses_authored: number;
			arguments_authored: number;
			stance_split: { support: number; reject: number };
			votes_cast: { support: number; reject: number; neutral: number };
			dominant_categories: { name: string; count: number }[];
			engaged_theses: number;
		};
		references?: { thesis_id: string; snippet: string }[];
		cached?: boolean;
		llm?: { ok: boolean; model?: string | null; error?: string; hint?: string; duration_ms?: number };
	}
	let report = $state<ReportBody | null>(null);
	let reportLoading = $state(false);
	let reportError = $state<string | null>(null);

	async function loadReport(force = false) {
		if (typeof window === 'undefined') return;
		reportLoading = true;
		reportError = null;
		try {
			const qs = new URLSearchParams();
			if (force) qs.set('force', 'true');
			const suffix = qs.toString() ? `?${qs.toString()}` : '';
			const res = await fetch(`/api/reports/me${suffix}`);
			if (!res.ok) {
				reportError = m.my_standpoint_server_error({ status: res.status });
				return;
			}
			report = await res.json();
		} catch (err) {
			reportError = (err as Error)?.message ?? m.my_standpoint_unknown_error();
		} finally {
			reportLoading = false;
		}
	}

	// ---- Budget today ----
	interface BudgetEvent {
		kind: 'weight_vote';
		at: string;
		thesis_id: string;
		thesis_title: string;
		vote_type?: string;
		extra_weight?: number;
		target?: 'thesis' | 'argument';
	}
	interface BudgetBody {
		date: string;
		spent: number;
		limit: number;
		remaining: number;
		events: BudgetEvent[];
	}
	let budget = $state<BudgetBody | null>(null);
	let budgetLoading = $state(false);

	async function loadBudget() {
		if (typeof window === 'undefined') return;
		budgetLoading = true;
		try {
			const res = await fetch('/api/budget/today');
			if (res.ok) budget = await res.json();
		} finally {
			budgetLoading = false;
		}
	}

	onMount(() => {
		loadBudget();
	});

	function fmtTime(iso: string): string {
		try {
			return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
		} catch {
			return iso;
		}
	}
</script>

<section class="my-page">
	<div class="page-head">
		<h1 class="page-title">{m.my_page_title()}</h1>
		<p class="page-subtitle">{m.my_page_subtitle()}</p>
	</div>

	<aside class="standpoint-panel card">
		<div class="standpoint-head">
			<h2 class="standpoint-title">{m.my_standpoint_title()}</h2>
			<p class="standpoint-sub">{m.my_standpoint_sub()}</p>
		</div>

		{#if !report && !reportLoading}
			<button class="btn btn-primary" onclick={() => loadReport(false)}>{m.my_standpoint_generate()}</button>
		{/if}

		{#if reportLoading}
			<p class="standpoint-status">{m.my_standpoint_generating()}</p>
		{/if}

		{#if report}
			{#if report.llm && !report.llm.ok}
				<div class="standpoint-error">
					<p>{m.my_standpoint_llm_unavailable({ error: report.llm.error ?? '' })}</p>
					{#if report.llm.hint}<p class="standpoint-hint">{report.llm.hint}</p>{/if}
				</div>
			{:else if report.text}
				<div class="standpoint-text">
					{#each report.text.split(/\n\n+/) as para}
						<p>{para}</p>
					{/each}
				</div>
				{#if report.references && report.references.length > 0}
					<div class="standpoint-refs">
						<span class="refs-label">{m.my_standpoint_refs_label()}</span>
						{#each report.references as ref}
							<a class="ref-link" href="/thesis/{ref.thesis_id}">{ref.snippet}</a>
						{/each}
					</div>
				{/if}
				<div class="standpoint-meta">
					{report.cached ? m.my_standpoint_cached() : m.my_standpoint_fresh()}{#if report.llm?.model} · {report.llm.model}{/if}
					<button class="btn btn-sm standpoint-refresh" onclick={() => loadReport(true)}>{m.my_standpoint_regenerate()}</button>
				</div>
			{:else}
				<p class="standpoint-status">{reportError ?? m.my_standpoint_no_text()}</p>
			{/if}
		{/if}

		{#if reportError && !report}
			<p class="standpoint-error">{reportError}</p>
		{/if}
	</aside>

	<aside id="budget" class="budget-panel card">
		<div class="budget-head">
			<h2 class="budget-title">{m.my_budget_title()}</h2>
			<p class="budget-sub">{m.my_budget_sub({ limit: budget?.limit ?? 62 })}</p>
		</div>

		{#if budgetLoading && !budget}
			<p class="budget-status">{m.my_budget_loading()}</p>
		{:else if budget}
			<div class="budget-summary">
				<div class="budget-summary-item">
					<span class="budget-summary-num">{budget.spent}</span>
					<span class="budget-summary-label">{m.my_budget_summary_extra()}</span>
				</div>
				<div class="budget-summary-item">
					<span class="budget-summary-num">{budget.remaining}</span>
					<span class="budget-summary-label">{m.panel_budget_weight()}</span>
				</div>
			</div>

			{#if budget.events.length === 0}
				<p class="budget-empty">{m.my_budget_empty()}</p>
			{:else}
				<ul class="budget-list">
					{#each budget.events as e}
						<li class="budget-item">
							<time class="budget-time">{fmtTime(e.at)}</time>
							<div class="budget-item-body">
								<a class="budget-link" href="/thesis/{e.thesis_id}">{e.thesis_title}</a>
								<p class="budget-content">{m.my_budget_weight_detail({ extra: e.extra_weight ?? 0, vote_type: e.vote_type ?? '', target: e.target === 'argument' ? m.my_budget_weight_on_argument() : m.my_budget_weight_on_thesis() })}</p>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</aside>

	<div class="grid grid-2">
		{#each myTheses as thesis (thesis.id)}
			<ThesisCard {thesis} heatRatio={heat[thesis.id] ?? 0} argumentCount={argumentCounts[thesis.id] ?? 0} />
		{/each}
	</div>

	{#if myTheses.length === 0}
		<p class="empty-state">{m.my_empty_state()}</p>
	{/if}
</section>

<style>
	.my-page {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.my-page :global(.card) {
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

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: 3rem 1rem;
		font-size: var(--text-lg);
	}

	.standpoint-panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.standpoint-head {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.standpoint-title {
		font-size: var(--text-lg);
		font-weight: 600;
		margin: 0;
	}

	.standpoint-sub {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		margin: 0;
	}

	.standpoint-status {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		margin: 0;
	}

	.standpoint-text {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.standpoint-text p {
		margin: 0;
		font-size: var(--text-base);
		line-height: 1.55;
	}

	.standpoint-refs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		padding-top: 0.5rem;
		border-top: 1px dashed var(--color-border);
		font-size: var(--text-xs);
	}

	.refs-label {
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}

	.ref-link {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 9999px;
		padding: 0.15rem 0.55rem;
		color: var(--color-text);
		text-decoration: none;
		max-width: 26ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ref-link:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.standpoint-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--text-xs);
		color: var(--color-text-light);
		font-family: var(--font-mono);
	}

	.standpoint-refresh {
		margin-left: auto;
	}

	.standpoint-error {
		background: var(--color-reject-bg);
		border: 1px solid var(--color-reject);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.75rem;
		color: var(--color-reject);
		font-size: var(--text-sm);
	}

	.standpoint-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: 0.25rem 0 0;
	}

	.budget-panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.budget-head {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.budget-title {
		font-size: var(--text-lg);
		font-weight: 600;
		margin: 0;
	}

	.budget-sub {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		margin: 0;
	}

	.budget-status,
	.budget-empty {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		margin: 0;
	}

	.budget-summary {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: 0.5rem;
		padding: 0.5rem 0;
		border-bottom: 1px dashed var(--color-border);
	}

	.budget-summary-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
	}

	.budget-summary-num {
		font-size: var(--text-xl);
		font-weight: 700;
		font-family: var(--font-mono);
		color: var(--color-text);
	}

	.budget-summary-label {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.budget-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.budget-item {
		display: grid;
		grid-template-columns: 3rem 1fr;
		gap: 0.5rem;
		align-items: baseline;
		padding: 0.3rem 0.5rem;
		background: var(--color-bg);
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
	}

	.budget-time {
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		color: var(--color-text-light);
	}

	.budget-item-body {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.budget-link {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text);
		text-decoration: none;
	}

	.budget-link:hover {
		color: var(--color-primary);
	}

	.budget-content {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		line-height: 1.4;
	}
</style>
