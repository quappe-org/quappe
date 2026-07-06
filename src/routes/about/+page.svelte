<script lang="ts">
	import { m } from '$lib/paraglide/messages';
</script>

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
	<h2>{m.about_explore_title()}</h2>
	<p>{m.about_explore_intro()}</p>
	<div class="explore-grid">
		<a href="/about/lifecycle" class="explore-card">
			<span class="explore-card-title">{m.about_nav_lifecycle()}</span>
			<span class="explore-card-desc">{m.about_explore_lifecycle_desc()}</span>
		</a>
		<a href="/about/heat" class="explore-card">
			<span class="explore-card-title">{m.about_nav_heat()}</span>
			<span class="explore-card-desc">{m.about_explore_heat_desc()}</span>
		</a>
		<a href="/about/voting" class="explore-card">
			<span class="explore-card-title">{m.about_nav_voting()}</span>
			<span class="explore-card-desc">{m.about_explore_voting_desc()}</span>
		</a>
		<a href="/about/fork" class="explore-card">
			<span class="explore-card-title">{m.about_nav_fork()}</span>
			<span class="explore-card-desc">{m.about_explore_fork_desc()}</span>
		</a>
		<a href="/about/complexity" class="explore-card">
			<span class="explore-card-title">{m.about_nav_complexity()}</span>
			<span class="explore-card-desc">{m.about_explore_complexity_desc()}</span>
		</a>
		<a href="/about/transparency" class="explore-card">
			<span class="explore-card-title">{m.about_nav_transparency()}</span>
			<span class="explore-card-desc">{m.about_explore_transparency_desc()}</span>
		</a>
	</div>
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

<footer class="about-footer">
	<a href="/" class="btn btn-primary">{m.about_cta_start()}</a>
</footer>

<style>
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

	.explore-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.5rem;
	}

	.explore-card {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		text-decoration: none;
		transition: border-color 0.15s;
	}

	.explore-card:hover {
		border-color: var(--color-primary);
	}

	.explore-card-title {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text);
	}

	.explore-card-desc {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		line-height: 1.4;
	}

	.about-footer {
		margin-top: 0.5rem;
	}
</style>
