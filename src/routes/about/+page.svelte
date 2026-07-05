<script lang="ts">
	import { m } from '$lib/paraglide/messages';
</script>

<section class="about-page">
	<aside class="about-visual">
		<img src="/dialog_network.png" alt={m.about_img_alt()} />
	</aside>

	<article class="about-content">
		<header>
			<h1>{m.about_title()}</h1>
			<p class="lead">{m.about_lead()}</p>
		</header>

		<section class="about-section">
			<h2>{m.about_purpose_title()}</h2>
			<p>{m.about_purpose_p1_html()}</p>
			<p>{@html m.about_purpose_p2_html()}</p>
		</section>

		<section class="about-section">
			<h2>{m.about_how_title()}</h2>
			<ul class="how-list">
				<li>{@html m.about_how_1_html()}</li>
				<li>{@html m.about_how_2_html()}</li>
				<li>{@html m.about_how_3_html()}</li>
				<li>{@html m.about_how_4_html()}</li>
				<li>{@html m.about_how_5_html()}</li>
				<li>{@html m.about_how_6_html()}</li>
			</ul>
		</section>

		<section class="about-section">
			<h2>{m.about_lifecycle_title()}</h2>
			<p>{m.about_lifecycle_intro()}</p>

			<div class="lifecycle-flow">
				<span class="lc-node lc-seedling">{m.about_lc_seedling_label()}</span>
				<span class="lc-arrow">→</span>
				<span class="lc-node lc-discussed">{m.about_lc_discussed_label()}</span>
				<span class="lc-arrow">→</span>
				<span class="lc-node lc-contested">{m.about_lc_contested_label()}</span>
				<span class="lc-arrow">→</span>
				<span class="lc-node lc-crystallized">{m.about_lc_crystallized_label()}</span>
				<span class="lc-arrow lc-arrow-fade">⤳</span>
				<span class="lc-node lc-faded">{m.about_lc_faded_label()}</span>
				<span class="lc-arrow lc-arrow-fade">⤳</span>
				<span class="lc-node lc-dormant">{m.about_lc_dormant_label()}</span>
			</div>

			<dl class="lc-states">
				<div class="lc-state">
					<dt><span class="lc-dot lc-seedling"></span> {m.about_lc_seedling_label()}</dt>
					<dd>{m.about_lc_seedling_desc()}</dd>
				</div>
				<div class="lc-state">
					<dt><span class="lc-dot lc-discussed"></span> {m.about_lc_discussed_label()}</dt>
					<dd>{m.about_lc_discussed_desc()}</dd>
				</div>
				<div class="lc-state">
					<dt><span class="lc-dot lc-contested"></span> {m.about_lc_contested_label()}</dt>
					<dd>{m.about_lc_contested_desc()}</dd>
				</div>
				<div class="lc-state">
					<dt><span class="lc-dot lc-crystallized"></span> {m.about_lc_crystallized_label()}</dt>
					<dd>{m.about_lc_crystallized_desc()}</dd>
				</div>
				<div class="lc-state">
					<dt><span class="lc-dot lc-faded"></span> {m.about_lc_faded_label()}</dt>
					<dd>{m.about_lc_faded_desc()}</dd>
				</div>
				<div class="lc-state">
					<dt><span class="lc-dot lc-dormant"></span> {m.about_lc_dormant_label()}</dt>
					<dd>{m.about_lc_dormant_desc()}</dd>
				</div>
			</dl>

			<p class="lc-note">{@html m.about_lc_note_html()}</p>
		</section>

		<section class="about-section rules">
			<h2>{m.about_rules_title()}</h2>
			<ol class="rules-list">
				<li>{m.about_rule_1()}</li>
				<li>{m.about_rule_2()}</li>
				<li>{m.about_rule_3()}</li>
				<li>{m.about_rule_4()}</li>
				<li>{m.about_rule_5()}</li>
				<li>{m.about_rule_6()}</li>
			</ol>
		</section>

		<section class="about-section">
			<h2>{m.about_not_title()}</h2>
			<p>{m.about_not_p()}</p>
		</section>

		<section class="about-section">
			<h2>{m.about_transparency_title()}</h2>
			<p>{m.about_transparency_intro()}</p>
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

		<footer class="about-footer">
			<a href="/" class="btn btn-primary">{m.about_cta_start()}</a>
		</footer>
	</article>
</section>

<style>
	.about-page {
		display: grid;
		grid-template-columns: 220px 1fr;
		gap: 2.5rem;
		align-items: start;
	}

	@media (max-width: 900px) {
		.about-page {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}
	}

	.about-visual {
		position: sticky;
		top: 1.5rem;
	}

	.about-visual img {
		width: 100%;
		max-width: 180px;
		height: auto;
		display: block;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
	}

	.about-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.about-content header h1 {
		font-size: var(--text-3xl);
		font-weight: 700;
		letter-spacing: -0.01em;
		margin: 0 0 0.5rem;
	}

	.lead {
		font-size: var(--text-lg);
		color: var(--color-text-muted);
		line-height: 1.6;
		margin: 0;
	}

	.about-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.about-section h2 {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.about-section p {
		color: var(--color-text);
		line-height: 1.65;
		margin: 0;
	}

	.how-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.how-list li {
		padding: 0.625rem 0.875rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--color-primary);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		line-height: 1.5;
	}

	.rules-list {
		list-style: decimal inside;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.rules-list li {
		padding: 0.625rem 0.875rem;
		background: #fef9c3;
		border: 1px solid #fde68a;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		line-height: 1.5;
		color: #713f12;
	}

	/* Lifecycle explainer */
	.lifecycle-flow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
		padding: 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.lc-node {
		display: inline-flex;
		align-items: center;
		padding: 0.25rem 0.625rem;
		font-size: var(--text-xs);
		font-weight: 500;
		border-radius: var(--radius-sm);
		text-transform: capitalize;
		border: 1px solid transparent;
		white-space: nowrap;
	}

	.lc-arrow {
		color: var(--color-text-light);
		font-size: var(--text-sm);
	}

	.lc-arrow-fade {
		color: var(--color-text-light);
		opacity: 0.6;
	}

	.lc-states {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 0.5rem;
		margin: 0;
		padding: 0;
	}

	.lc-state {
		padding: 0.5rem 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.lc-state dt {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: var(--text-sm);
		font-weight: 600;
		text-transform: capitalize;
		margin-bottom: 0.125rem;
	}

	.lc-state dd {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		line-height: 1.5;
	}

	.lc-dot {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 1px solid transparent;
	}

	.lc-note {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		font-style: italic;
	}

	/* Lifecycle color palette (matches ThesisCard badges) */
	.lc-seedling {
		background: #ecfccb;
		color: #365314;
		border-color: #bef264;
	}
	.lc-discussed {
		background: #dbeafe;
		color: #1e3a8a;
		border-color: #93c5fd;
	}
	.lc-contested {
		background: #fef3c7;
		color: #78350f;
		border-color: #fbbf24;
	}
	.lc-crystallized {
		background: #cffafe;
		color: #164e63;
		border-color: #67e8f9;
	}
	.lc-faded {
		background: #f1f5f9;
		color: #64748b;
		border-color: #cbd5e1;
	}
	.lc-dormant {
		background: #f8fafc;
		color: #94a3b8;
		border-color: #e2e8f0;
	}

	.about-footer {
		margin-top: 0.5rem;
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
</style>
