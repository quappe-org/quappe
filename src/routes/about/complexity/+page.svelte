<script lang="ts">
	import { m } from '$lib/paraglide/messages';
</script>

<header>
	<h1>{m.about_complexity_title()}</h1>
	<p class="lead">{m.about_complexity_lead()}</p>
</header>

<section class="about-section">
	<h2>{m.about_complexity_what_title()}</h2>
	<p>{m.about_complexity_what_p()}</p>
</section>

<section class="about-section">
	<h2>{m.about_complexity_effect_title()}</h2>
	<ul class="cx-list">
		<li>{@html m.about_complexity_effect_1_html()}</li>
		<li>{@html m.about_complexity_effect_2_html()}</li>
		<li>{@html m.about_complexity_effect_3_html()}</li>
	</ul>
</section>

<section class="about-section">
	<h2>{m.about_complexity_tip_title()}</h2>
	<p>{m.about_complexity_tip_p()}</p>
</section>

<style>
	.cx-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.cx-list li {
		padding: 0.5rem 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--color-primary);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
</style>
