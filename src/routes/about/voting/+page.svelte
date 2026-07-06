<script lang="ts">
	import { m } from '$lib/paraglide/messages';
</script>

<header>
	<h1>{m.about_voting_title()}</h1>
	<p class="lead">{m.about_voting_lead()}</p>
</header>

<section class="about-section">
	<h2>{m.about_voting_kinds_title()}</h2>
	<ul class="vote-kinds">
		<li>
			<span class="vote-chip vote-support">{m.about_voting_support_label()}</span>
			<span>{m.about_voting_support_desc()}</span>
		</li>
		<li>
			<span class="vote-chip vote-reject">{m.about_voting_reject_label()}</span>
			<span>{m.about_voting_reject_desc()}</span>
		</li>
		<li>
			<span class="vote-chip vote-neutral">{m.about_voting_neutral_label()}</span>
			<span>{m.about_voting_neutral_desc()}</span>
		</li>
	</ul>
</section>

<section class="about-section">
	<h2>{m.about_voting_budget_title()}</h2>
	<p>{@html m.about_voting_budget_p_html()}</p>
</section>

<section class="about-section">
	<h2>{m.about_voting_weighted_title()}</h2>
	<p>{m.about_voting_weighted_p()}</p>
</section>

<section class="about-section">
	<h2>{m.about_voting_change_title()}</h2>
	<p>{m.about_voting_change_p()}</p>
</section>

<style>
	.vote-kinds {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.vote-kinds li {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		line-height: 1.5;
	}

	.vote-chip {
		display: inline-flex;
		align-items: center;
		padding: 0.1rem 0.55rem;
		font-size: var(--text-xs);
		font-weight: 600;
		border-radius: var(--radius-sm);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.vote-support { background: var(--color-support-bg); color: var(--color-support); }
	.vote-reject { background: var(--color-reject-bg); color: var(--color-reject); }
	.vote-neutral { background: var(--color-neutral-bg); color: var(--color-neutral); }
</style>
