<script lang="ts">
	import { m } from '$lib/paraglide/messages';
</script>

<header>
	<h1>{m.about_heat_title()}</h1>
	<p class="lead">{m.about_heat_lead()}</p>
</header>

<section class="about-section">
	<h2>{m.about_heat_what_title()}</h2>
	<p>{@html m.about_heat_what_p_html()}</p>
</section>

<section class="about-section">
	<h2>{m.about_heat_levels_title()}</h2>
	<dl class="heat-levels">
		<div class="heat-level heat-hot">
			<dt><span class="heat-band-preview heat-hot-band"></span> {m.about_heat_hot_label()}</dt>
			<dd>{m.about_heat_hot_desc()}</dd>
		</div>
		<div class="heat-level heat-warm">
			<dt><span class="heat-band-preview heat-warm-band"></span> {m.about_heat_warm_label()}</dt>
			<dd>{m.about_heat_warm_desc()}</dd>
		</div>
		<div class="heat-level heat-cool">
			<dt><span class="heat-band-preview heat-cool-band"></span> {m.about_heat_cool_label()}</dt>
			<dd>{m.about_heat_cool_desc()}</dd>
		</div>
		<div class="heat-level heat-cold">
			<dt><span class="heat-band-preview heat-cold-band"></span> {m.about_heat_cold_label()}</dt>
			<dd>{m.about_heat_cold_desc()}</dd>
		</div>
	</dl>
</section>

<section class="about-section">
	<h2>{m.about_heat_why_title()}</h2>
	<p>{m.about_heat_why_p()}</p>
</section>

<style>
	.heat-levels {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 0.5rem;
		margin: 0;
	}

	.heat-level {
		padding: 0.5rem 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.heat-level dt {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--text-sm);
		font-weight: 600;
		text-transform: capitalize;
		margin-bottom: 0.125rem;
	}

	.heat-level dd {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		line-height: 1.5;
	}

	.heat-band-preview {
		display: inline-block;
		width: 8px;
		height: 24px;
		border-radius: 2px;
	}

	.heat-hot-band { background: #ef4444; }
	.heat-warm-band { background: #f59e0b; }
	.heat-cool-band { background: #38bdf8; }
	.heat-cold-band { background: #94a3b8; }
</style>
