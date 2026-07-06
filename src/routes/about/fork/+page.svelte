<script lang="ts">
	import { m } from '$lib/paraglide/messages';
</script>

<header>
	<h1>{m.about_fork_title()}</h1>
	<p class="lead">{m.about_fork_lead()}</p>
</header>

<section class="about-section">
	<h2>{m.about_fork_when_title()}</h2>
	<p>{m.about_fork_when_p()}</p>
</section>

<section class="about-section">
	<h2>{m.about_fork_how_title()}</h2>
	<ol class="fork-steps">
		<li>{m.about_fork_step_1()}</li>
		<li>{m.about_fork_step_2()}</li>
		<li>{m.about_fork_step_3()}</li>
	</ol>
</section>

<section class="about-section">
	<h2>{m.about_fork_feed_title()}</h2>
	<p>{@html m.about_fork_feed_p_html()}</p>
</section>

<style>
	.fork-steps {
		list-style: decimal inside;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.fork-steps li {
		padding: 0.5rem 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
</style>
