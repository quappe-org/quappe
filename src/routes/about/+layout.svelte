<script lang="ts">
	import { page } from '$app/stores';
	import { m } from '$lib/paraglide/messages';

	let { children } = $props();

	const links = [
		{ href: '/about', label: () => m.about_nav_intro() },
		{ href: '/about/lifecycle', label: () => m.about_nav_lifecycle() },
		{ href: '/about/heat', label: () => m.about_nav_heat() },
		{ href: '/about/voting', label: () => m.about_nav_voting() },
		{ href: '/about/fork', label: () => m.about_nav_fork() },
		{ href: '/about/complexity', label: () => m.about_nav_complexity() },
		{ href: '/about/transparency', label: () => m.about_nav_transparency() }
	];

	function isActive(href: string): boolean {
		if (href === '/about') return $page.url.pathname === '/about';
		return $page.url.pathname.startsWith(href);
	}
</script>

<section class="about-shell">
	<aside class="about-side">
		<img src="/dialog_network.png" alt={m.about_img_alt()} class="about-image" />
		<nav class="about-nav" aria-label="About sections">
			{#each links as l}
				<a href={l.href} class="about-nav-item" class:active={isActive(l.href)}>
					{l.label()}
				</a>
			{/each}
		</nav>
	</aside>

	<article class="about-body">
		{@render children()}
	</article>
</section>

<style>
	.about-shell {
		display: grid;
		grid-template-columns: 220px 1fr;
		gap: 2.5rem;
		align-items: start;
	}

	@media (max-width: 900px) {
		.about-shell {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}
	}

	.about-side {
		position: sticky;
		top: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.about-image {
		width: 100%;
		max-width: 180px;
		height: auto;
		display: block;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
	}

	.about-nav {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.about-nav-item {
		padding: 0.4rem 0.6rem;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		text-decoration: none;
		border-radius: var(--radius-sm);
		border-left: 2px solid transparent;
	}

	.about-nav-item:hover {
		color: var(--color-text);
		background: var(--color-surface);
	}

	.about-nav-item.active {
		color: var(--color-primary);
		border-left-color: var(--color-primary);
		background: var(--color-primary-bg);
		font-weight: 600;
	}

	.about-body {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		min-width: 0;
	}

	.about-body :global(h1) {
		font-size: var(--text-3xl);
		font-weight: 700;
		letter-spacing: -0.01em;
		margin: 0 0 0.5rem;
	}

	.about-body :global(h2) {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.about-body :global(.lead) {
		font-size: var(--text-lg);
		color: var(--color-text-muted);
		line-height: 1.6;
		margin: 0;
	}

	.about-body :global(.about-section) {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.about-body :global(.about-section p) {
		color: var(--color-text);
		line-height: 1.65;
		margin: 0;
	}
</style>
