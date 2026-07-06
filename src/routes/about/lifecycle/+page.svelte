<script lang="ts">
	import { m } from '$lib/paraglide/messages';
</script>

<header>
	<h1>{m.about_lifecycle_title()}</h1>
	<p class="lead">{m.about_lifecycle_intro()}</p>
</header>

<section class="about-section">
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

<style>
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
</style>
