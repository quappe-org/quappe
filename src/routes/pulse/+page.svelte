<script lang="ts">
	import type { PulseBody } from '$lib/server/pulse';

	let { data } = $props();

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
				loadError = `Server antwortete ${res.status}`;
				return;
			}
			pulse = await res.json();
		} catch (err) {
			loadError = (err as Error)?.message ?? 'Unbekannter Fehler';
		} finally {
			refreshing = false;
		}
	}

	let paragraphs = $derived(pulse?.text ? pulse.text.split(/\n\n+/) : []);
</script>

<section class="stack-lg">
	<div class="page-head">
		<h1 class="page-title">Community Pulse</h1>
		<p class="page-subtitle">Was bewegt die Community — beobachtend, nicht wertend.</p>
	</div>

	{#if loadError && !pulse}
		<p class="pulse-error">{loadError}</p>
	{/if}

	{#if pulse}
		<article class="pulse-report card">
			{#if pulse.llm && !pulse.llm.ok}
				<div class="pulse-llm-error">
					<p>LLM nicht verfügbar: {pulse.llm.error}</p>
					{#if pulse.llm.hint}<p class="pulse-hint">{pulse.llm.hint}</p>{/if}
				</div>
			{:else if paragraphs.length > 0}
				<div class="pulse-text">
					{#each paragraphs as para}
						<p>{para}</p>
					{/each}
				</div>
			{:else}
				<p class="pulse-status">Kein Text erhalten.</p>
			{/if}

			<div class="pulse-meta">
				{pulse.cached ? 'Aus Cache' : 'Frisch erstellt'}{#if pulse.llm?.model} · {pulse.llm.model}{/if} ·
				<time datetime={pulse.generated_at}>{new Date(pulse.generated_at).toLocaleString('de-DE')}</time>
				<button class="btn btn-sm pulse-refresh" onclick={refresh} disabled={refreshing}>
					{refreshing ? 'Wird erneuert …' : 'Neu erstellen'}
				</button>
			</div>
		</article>

		<div class="pulse-grid">
			<section class="pulse-panel card">
				<h2 class="pulse-panel-title">Heiß diskutiert</h2>
				<p class="pulse-panel-hint">Aktivitäts-Score = Kombination aus Votes und Argumenten.</p>
				{#if pulse.stats.hot_theses.length === 0}
					<p class="pulse-empty">Noch nichts.</p>
				{:else}
					<ol class="pulse-list">
						{#each pulse.stats.hot_theses as t}
							<li>
								<a href="/thesis/{t.id}" class="pulse-link">{t.title}</a>
								<span class="pulse-metric">heat {t.heat.toFixed(2)} · {t.arguments} Args</span>
							</li>
						{/each}
					</ol>
				{/if}
			</section>

			<section class="pulse-panel card">
				<h2 class="pulse-panel-title">Komplex</h2>
				<p class="pulse-panel-hint">Viele Argumente, ausgeglichene Vote-Verteilung.</p>
				{#if pulse.stats.complex_theses.length === 0}
					<p class="pulse-empty">Noch nichts.</p>
				{:else}
					<ol class="pulse-list">
						{#each pulse.stats.complex_theses as t}
							<li>
								<a href="/thesis/{t.id}" class="pulse-link">{t.title}</a>
								<span class="pulse-metric">{t.arguments} Args</span>
							</li>
						{/each}
					</ol>
				{/if}
			</section>

			<section class="pulse-panel card">
				<h2 class="pulse-panel-title">Kategorien-Treiber</h2>
				<p class="pulse-panel-hint">Wo die meiste inhaltliche Arbeit stattfindet.</p>
				{#if pulse.stats.driving_categories.length === 0}
					<p class="pulse-empty">Noch nichts.</p>
				{:else}
					<ul class="pulse-list">
						{#each pulse.stats.driving_categories as c}
							<li>
								<span class="pulse-cat">{c.name}</span>
								<span class="pulse-metric">{c.thesis_count} Thesen · {c.argument_count} Args · {Math.round(c.avg_support_ratio * 100)}% pro</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="pulse-panel card">
				<h2 class="pulse-panel-title">Zahlen</h2>
				<p class="pulse-panel-hint">Gesamt und aktuelle Woche.</p>
				<dl class="pulse-numbers">
					<div>
						<dt>Thesen gesamt</dt>
						<dd>{pulse.stats.total_theses}</dd>
					</div>
					<div>
						<dt>Argumente gesamt</dt>
						<dd>{pulse.stats.total_arguments}</dd>
					</div>
					<div>
						<dt>Neue Thesen (7 Tage)</dt>
						<dd>{pulse.stats.recent_week.new_theses}</dd>
					</div>
				</dl>
			</section>
		</div>
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

	.pulse-report {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.pulse-text {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
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
		padding-top: 0.5rem;
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

	.pulse-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1rem;
	}

	.pulse-panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.pulse-panel-title {
		font-size: var(--text-lg);
		font-weight: 600;
		margin: 0;
	}

	.pulse-panel-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: 0;
	}

	.pulse-empty {
		font-size: var(--text-sm);
		color: var(--color-text-light);
		margin: 0;
	}

	.pulse-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
		counter-reset: pulse-item;
	}

	.pulse-list li {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding-left: 1.5rem;
		position: relative;
	}

	ol.pulse-list li::before {
		counter-increment: pulse-item;
		content: counter(pulse-item);
		position: absolute;
		left: 0;
		top: 0;
		width: 1.15rem;
		height: 1.15rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		font-size: 0.65rem;
		font-weight: 700;
		color: var(--color-text-muted);
		font-family: var(--font-mono);
	}

	ul.pulse-list li {
		padding-left: 0;
	}

	.pulse-link {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text);
		text-decoration: none;
	}

	.pulse-link:hover {
		color: var(--color-primary);
	}

	.pulse-cat {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text);
	}

	.pulse-metric {
		font-size: var(--text-xs);
		color: var(--color-text-light);
		font-family: var(--font-mono);
	}

	.pulse-numbers {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 0.75rem;
		margin: 0;
	}

	.pulse-numbers > div {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.pulse-numbers dt {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.pulse-numbers dd {
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
		font-family: var(--font-mono);
	}
</style>
