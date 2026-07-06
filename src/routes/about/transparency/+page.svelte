<script lang="ts">
	import { m } from '$lib/paraglide/messages';
</script>

<header>
	<h1>{m.about_transparency_title()}</h1>
	<p class="lead">{m.about_transparency_intro()}</p>
</header>

<section class="about-section">
	<ul class="transparency-list">
		<li>{@html m.about_transp_identity_html()}</li>
		<li>{@html m.about_transp_abuse_html()}</li>
		<li>{@html m.about_transp_data_html()}</li>
		<li>{@html m.about_transp_search_html()}</li>
		<li>{@html m.about_transp_llm_html()}</li>
		<li>{@html m.about_transp_updates_html()}</li>
		<li>{@html m.about_transp_budget_html()}</li>
		<li>{@html m.about_transp_analytics_html()}</li>
	</ul>
</section>

<section class="about-section">
	<h2>{m.about_license_title()}</h2>
	<p>{@html m.about_license_p_html()}</p>
	<ul class="policy-list">
		<li><span class="ok">✓</span> {m.about_license_ok_1()}</li>
		<li><span class="ok">✓</span> {m.about_license_ok_2()}</li>
		<li><span class="ok">✓</span> {m.about_license_ok_3()}</li>
		<li><span class="no">✗</span> {m.about_license_no_1()}</li>
		<li><span class="no">✗</span> {m.about_license_no_2()}</li>
	</ul>
	<p class="policy-note">{@html m.about_license_note_html()}</p>
	<p class="policy-links">{@html m.about_license_links_html()}</p>
</section>

<style>
	.transparency-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.transparency-list li {
		padding: 0.625rem 0.875rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--color-text-muted);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		line-height: 1.55;
	}

	.transparency-list :global(code) {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background: var(--color-bg);
		padding: 0.05rem 0.3rem;
		border-radius: var(--radius-sm);
	}

	.policy-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.policy-list li {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: var(--text-sm);
		line-height: 1.5;
	}

	.policy-list .ok {
		color: var(--color-support);
		font-weight: 700;
	}

	.policy-list .no {
		color: var(--color-reject);
		font-weight: 700;
	}

	.policy-note {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		font-style: italic;
	}

	.policy-links {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}
</style>
