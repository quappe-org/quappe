<script lang="ts">
	import type { Thesis } from '$lib/models/types';
	import { getUserId } from '$lib/stores/user';
	import { activityStore } from '$lib/stores/activity.svelte';
	import ThesisCard from '$lib/components/ThesisCard.svelte';

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
		activityStore.set(data.activity ?? [], 'Platform activity');
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
			const uid = getUserId();
			const qs = new URLSearchParams({ user_id: uid });
			if (force) qs.set('force', 'true');
			const res = await fetch(`/api/reports/me?${qs.toString()}`);
			if (!res.ok) {
				reportError = `Server antwortete ${res.status}`;
				return;
			}
			report = await res.json();
		} catch (err) {
			reportError = (err as Error)?.message ?? 'Unbekannter Fehler';
		} finally {
			reportLoading = false;
		}
	}
</script>

<section class="stack-lg">
	<div class="page-head">
		<h1 class="page-title">My Theses</h1>
		<p class="page-subtitle">Theses you created or voted on.</p>
	</div>

	<aside class="standpoint-panel card">
		<div class="standpoint-head">
			<h2 class="standpoint-title">Mein Standpunkt</h2>
			<p class="standpoint-sub">Reflexions-Report über deine bisherige Arbeit — no blaming, nur Referenz.</p>
		</div>

		{#if !report && !reportLoading}
			<button class="btn btn-primary" onclick={() => loadReport(false)}>Report generieren</button>
		{/if}

		{#if reportLoading}
			<p class="standpoint-status">Wird erstellt … (kann bei erstem Aufruf 5–20s dauern)</p>
		{/if}

		{#if report}
			{#if report.llm && !report.llm.ok}
				<div class="standpoint-error">
					<p>LLM nicht verfügbar: {report.llm.error}</p>
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
						<span class="refs-label">Bezug auf:</span>
						{#each report.references as ref}
							<a class="ref-link" href="/thesis/{ref.thesis_id}">{ref.snippet}</a>
						{/each}
					</div>
				{/if}
				<div class="standpoint-meta">
					{report.cached ? 'Aus Cache' : 'Frisch erstellt'}{#if report.llm?.model} · {report.llm.model}{/if}
					<button class="btn btn-sm standpoint-refresh" onclick={() => loadReport(true)}>Neu erstellen</button>
				</div>
			{:else}
				<p class="standpoint-status">{reportError ?? 'Kein Text erhalten.'}</p>
			{/if}
		{/if}

		{#if reportError && !report}
			<p class="standpoint-error">{reportError}</p>
		{/if}
	</aside>

	<div class="grid grid-2">
		{#each myTheses as thesis (thesis.id)}
			<ThesisCard {thesis} heatRatio={heat[thesis.id] ?? 0} argumentCount={argumentCounts[thesis.id] ?? 0} />
		{/each}
	</div>

	{#if myTheses.length === 0}
		<p class="empty-state">You haven't participated yet. Go vote or create a thesis!</p>
	{/if}
</section>

<style>
	.page-head {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
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
		gap: 0.75rem;
	}

	.standpoint-head {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
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
</style>
