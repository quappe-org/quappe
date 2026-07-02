<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ComplexitySettings } from '$lib/models/types';
	import { complexityStore } from '$lib/stores/complexity.svelte';
	import { budgetStore } from '$lib/stores/budget.svelte';
	import { activityStore } from '$lib/stores/activity.svelte';
	import { uiIntents } from '$lib/stores/ui.svelte';
	import ComplexitySlider from '$lib/components/ComplexitySlider.svelte';
	import ActivityGraph from '$lib/components/ActivityGraph.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import '../app.css';

	let { children }: { children: Snippet } = $props();

	function handleComplexityChange(settings: ComplexitySettings) {
		complexityStore.set(settings);
	}

	let currentPath = $derived(page.url.pathname);

	function isActive(path: string): boolean {
		if (path === '/') return currentPath === '/';
		return currentPath.startsWith(path);
	}

	async function newThesis() {
		uiIntents.requestNewThesis();
		if (currentPath !== '/') {
			await goto('/');
		}
	}
</script>

<div class="app">
	<header class="topbar">
		<div class="topbar-inner">
			<a href="/" class="brand">
				<Logo size={24} />
				<span>Quappe</span>
			</a>
			<button class="menu-toggle" aria-label="Menu" onclick={() => document.body.classList.toggle('nav-open')}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
			</button>
		</div>
	</header>

	<div class="shell">
		<!-- LEFT SIDEBAR: Brand + Navigation -->
		<aside class="sidebar sidebar-left">
			<a href="/" class="brand brand-sidebar">
				<Logo size={28} />
				<span>Quappe</span>
			</a>
			<nav class="nav">
				<a href="/" class="nav-item" class:active={isActive('/')}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
					Trending
				</a>
				<a href="/top" class="nav-item" class:active={isActive('/top')}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
					Top
				</a>
				<a href="/my" class="nav-item" class:active={isActive('/my')}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
					My Theses
				</a>

				<button
					class="new-thesis-btn"
					onclick={newThesis}
					disabled={!budgetStore.canCreate('thesis')}
					title={!budgetStore.canCreate('thesis') ? 'Daily budget for theses depleted' : 'Create a new thesis'}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
					New Thesis
				</button>
			</nav>

			<div class="nav-separator" aria-hidden="true"></div>

			<nav class="nav nav-secondary">
				<a href="/about" class="nav-item" class:active={isActive('/about')}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
					About
				</a>
			</nav>
		</aside>

		<!-- MAIN CONTENT -->
		<main class="main">
			{@render children()}
		</main>

		<!-- RIGHT SIDEBAR: Budget + Activity + Complexity + Settings -->
		<aside class="sidebar sidebar-right">
			<div class="brand-spacer" aria-hidden="true"></div>

			<div class="panel">
				<h3 class="panel-title">Daily Budget</h3>
				<p class="panel-hint">Creating costs budget. Resets daily.</p>
				<div class="budget-list">
					<div class="budget-row">
						<span class="budget-label">Theses</span>
						<span class="budget-bar">
							<span class="budget-bar-fill" style="width: {(budgetStore.thesis / budgetStore.limit) * 100}%"></span>
						</span>
						<span class="budget-count" class:low={budgetStore.thesis === 0}>{budgetStore.thesis}/{budgetStore.limit}</span>
					</div>
					<div class="budget-row">
						<span class="budget-label budget-support">Support args</span>
						<span class="budget-bar">
							<span class="budget-bar-fill bar-support" style="width: {(budgetStore.support / budgetStore.limit) * 100}%"></span>
						</span>
						<span class="budget-count" class:low={budgetStore.support === 0}>{budgetStore.support}/{budgetStore.limit}</span>
					</div>
					<div class="budget-row">
						<span class="budget-label budget-reject">Reject args</span>
						<span class="budget-bar">
							<span class="budget-bar-fill bar-reject" style="width: {(budgetStore.reject / budgetStore.limit) * 100}%"></span>
						</span>
						<span class="budget-count" class:low={budgetStore.reject === 0}>{budgetStore.reject}/{budgetStore.limit}</span>
					</div>
				</div>
			</div>

			{#if activityStore.data.length > 0}
				<ActivityGraph data={activityStore.data} title={activityStore.title} height={60} />
			{/if}

			<div class="panel">
				<h3 class="panel-title">Complexity</h3>
				<ComplexitySlider onchange={handleComplexityChange} />
			</div>

			<div class="panel">
				<a href="/settings" class="settings-link" class:active={isActive('/settings')}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="3"></circle>
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 9 3.17V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
					</svg>
					Settings
				</a>
			</div>
		</aside>
	</div>
</div>

<style>
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.topbar {
		display: none;
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		padding: 0.75rem 1rem;
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.topbar-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--color-text);
		text-decoration: none;
		letter-spacing: -0.01em;
	}

	.brand-sidebar {
		padding: 0.5rem 0.75rem 1rem;
		border-bottom: 1px solid var(--color-border);
		margin-bottom: 0.25rem;
	}

	/* Mirrors height of .brand-sidebar so the right sidebar starts at same y-position as nav */
	.brand-spacer {
		height: calc(28px + 0.5rem + 1rem + 1px + 0.25rem);
	}

	.brand:hover {
		color: var(--color-primary);
	}

	.menu-toggle {
		background: none;
		border: none;
		color: var(--color-text);
		cursor: pointer;
		padding: 0.25rem;
	}

	.shell {
		flex: 1;
		display: grid;
		grid-template-columns: 200px 1fr 260px;
		gap: 1.25rem;
		max-width: 1600px;
		width: 100%;
		margin: 0 auto;
		padding: 1rem 1.25rem;
	}

	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.sidebar-left {
		position: sticky;
		top: 1.5rem;
		align-self: flex-start;
	}

	.sidebar-right {
		position: sticky;
		top: 1.5rem;
		align-self: flex-start;
	}

	.nav {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.75rem;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-muted);
		text-decoration: none;
		border-radius: var(--radius-md);
		transition: background var(--transition-fast), color var(--transition-fast);
	}

	.nav-item:hover {
		background: var(--color-bg);
		color: var(--color-text);
	}

	.nav-item.active {
		background: var(--color-primary-bg);
		color: var(--color-primary);
		font-weight: 600;
	}

	.new-thesis-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin-top: 0.5rem;
		font-family: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		color: white;
		background: var(--color-primary);
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background var(--transition-fast), border-color var(--transition-fast);
	}

	.new-thesis-btn:hover:not(:disabled) {
		background: var(--color-primary-hover);
		border-color: var(--color-primary-hover);
	}

	.new-thesis-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.nav-separator {
		height: 1px;
		background: var(--color-border);
		margin: 1rem 0.5rem;
	}

	.nav-secondary {
		gap: 0.25rem;
	}

	.main {
		min-width: 0;
	}

	.panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.panel-title {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.panel-hint {
		font-size: var(--text-xs);
		color: var(--color-text-light);
		margin: 0;
		line-height: 1.4;
	}

	.budget-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.budget-row {
		display: grid;
		grid-template-columns: 80px 1fr 40px;
		align-items: center;
		gap: 0.5rem;
	}

	.budget-label {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.budget-support {
		color: var(--color-support);
	}

	.budget-reject {
		color: var(--color-reject);
	}

	.budget-bar {
		height: 6px;
		background: var(--color-bg);
		border-radius: 3px;
		overflow: hidden;
		position: relative;
	}

	.budget-bar-fill {
		display: block;
		height: 100%;
		background: var(--color-primary);
		transition: width var(--transition-base);
	}

	.bar-support {
		background: var(--color-support);
	}

	.bar-reject {
		background: var(--color-reject);
	}

	.budget-count {
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		color: var(--color-text-muted);
		text-align: right;
	}

	.budget-count.low {
		color: var(--color-reject);
	}

	.settings-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		text-decoration: none;
		font-weight: 500;
	}

	.settings-link:hover,
	.settings-link.active {
		color: var(--color-primary);
	}

	@media (max-width: 1024px) {
		.shell {
			grid-template-columns: 180px 1fr;
			padding: 0.75rem 1rem;
		}
		.sidebar-right {
			display: none;
		}
	}

	@media (max-width: 768px) {
		.topbar {
			display: block;
		}
		.shell {
			grid-template-columns: 1fr;
			padding: 0.75rem;
		}
		.sidebar-left {
			display: none;
		}
		:global(body.nav-open) .sidebar-left {
			display: flex;
			position: fixed;
			top: 56px;
			left: 0;
			width: 240px;
			height: calc(100vh - 56px);
			background: var(--color-surface);
			border-right: 1px solid var(--color-border);
			padding: 1rem;
			z-index: 90;
		}
	}
</style>
