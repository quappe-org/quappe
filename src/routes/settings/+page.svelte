<script lang="ts">
	import { getUserId } from '$lib/stores/user';
	import { categoriesStore } from '$lib/stores/categories.svelte';
	import { complexityBoundsStore } from '$lib/stores/complexity-bounds.svelte';
	import { themeStore, type Theme } from '$lib/stores/theme.svelte';
	import { getLocale, setLocale, locales, type Locale } from '$lib/paraglide/runtime';
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	let userId = $state('');
	$effect(() => {
		userId = getUserId();
	});

	// Language & theme — mounted guard so SSR doesn't lock in a wrong active state
	let mounted = $state(false);
	onMount(() => { mounted = true; });

	const localeLabels: Record<Locale, string> = {
		en: 'English',
		de: 'Deutsch',
		fr: 'Français',
		es: 'Español'
	};
	let activeLocale = $derived<Locale>(mounted ? getLocale() : 'en');
	function switchLocale(locale: Locale) {
		if (locale === activeLocale) return;
		setLocale(locale);
	}

	const themes: { id: Theme; label: () => string }[] = [
		{ id: 'rainbow', label: () => m.panel_theme_rainbow() },
		{ id: 'pastel', label: () => m.panel_theme_pastel() },
		{ id: 'grayscale', label: () => m.panel_theme_grayscale() }
	];

	// Category management
	let newCategory = $state('');

	function addCategory() {
		const cat = newCategory.trim().toLowerCase();
		if (cat) {
			categoriesStore.add(cat);
			newCategory = '';
		}
	}

	function removeCategory(cat: string) {
		categoriesStore.remove(cat);
	}

	function resetCategories() {
		categoriesStore.reset();
	}

	// Complexity bounds
	function updateMinTheses(e: Event) {
		const v = Number((e.target as HTMLInputElement).value);
		if (!isNaN(v)) complexityBoundsStore.setMin({ max_theses: v });
	}
	function updateMaxTheses(e: Event) {
		const v = Number((e.target as HTMLInputElement).value);
		if (!isNaN(v)) complexityBoundsStore.setMax({ max_theses: v });
	}
	function updateMinArgs(e: Event) {
		const v = Number((e.target as HTMLInputElement).value);
		if (!isNaN(v)) complexityBoundsStore.setMin({ max_arguments: v });
	}
	function updateMaxArgs(e: Event) {
		const v = Number((e.target as HTMLInputElement).value);
		if (!isNaN(v)) complexityBoundsStore.setMax({ max_arguments: v });
	}
</script>

<section class="stack-lg">
	<div class="card stack">
		<div class="setting-group">
			<h3 class="setting-label">{m.panel_language_title()}</h3>
		</div>
		<div class="pill-group" role="group" aria-label={m.panel_language_title()}>
			{#each locales as loc}
				<button
					type="button"
					class="pill-btn"
					class:active={mounted && loc === activeLocale}
					aria-pressed={mounted && loc === activeLocale}
					title={localeLabels[loc]}
					onclick={() => switchLocale(loc)}
				>
					{localeLabels[loc]}
				</button>
			{/each}
		</div>
	</div>

	<div class="card stack">
		<div class="setting-group">
			<h3 class="setting-label">{m.panel_theme_title()}</h3>
		</div>
		<div class="pill-group" role="group" aria-label={m.panel_theme_title()}>
			{#each themes as t}
				<button
					type="button"
					class="pill-btn"
					class:active={mounted && themeStore.current === t.id}
					aria-pressed={mounted && themeStore.current === t.id}
					title={t.label()}
					onclick={() => themeStore.set(t.id)}
				>
					{t.label()}
				</button>
			{/each}
		</div>
	</div>

	<div class="card stack">
		<div class="setting-group">
			<h3 class="setting-label">{m.settings_id_title()}</h3>
			<p class="setting-value mono">{userId}</p>
			<p class="setting-hint">{m.settings_id_hint()}</p>
		</div>

		<hr class="divider" />

		<div class="setting-group">
			<h3 class="setting-label">{m.settings_role_title()}</h3>
			<span class="role-badge">{m.settings_role_badge_admin()}</span>
			<p class="setting-hint">{m.settings_role_hint()}</p>
		</div>
	</div>

	<div class="card stack">
		<div class="setting-group">
			<div class="setting-header">
				<h3 class="setting-label">{m.settings_bounds_title()}</h3>
				<button class="btn btn-sm" onclick={() => complexityBoundsStore.reset()}>{m.settings_bounds_reset()}</button>
			</div>
			<p class="setting-hint">{m.settings_bounds_hint()}</p>
		</div>

		<div class="bounds-grid">
			<div class="bound-row">
				<span class="bound-label">{m.settings_bounds_theses_label()}</span>
				<div class="bound-controls">
					<label>
						<span class="tiny">{m.settings_bounds_min()}</span>
						<input
							type="number"
							min={complexityBoundsStore.hardMin.max_theses}
							max={complexityBoundsStore.max.max_theses}
							value={complexityBoundsStore.min.max_theses}
							oninput={updateMinTheses}
						/>
					</label>
					<span class="range-sep">…</span>
					<label>
						<span class="tiny">{m.settings_bounds_max()}</span>
						<input
							type="number"
							min={complexityBoundsStore.min.max_theses}
							max={complexityBoundsStore.hardMax.max_theses}
							value={complexityBoundsStore.max.max_theses}
							oninput={updateMaxTheses}
						/>
					</label>
					<span class="hard-limits mono">{m.settings_bounds_hard_limit({ min: complexityBoundsStore.hardMin.max_theses, max: complexityBoundsStore.hardMax.max_theses })}</span>
				</div>
			</div>

			<div class="bound-row">
				<span class="bound-label">{m.settings_bounds_args_label()}</span>
				<div class="bound-controls">
					<label>
						<span class="tiny">{m.settings_bounds_min()}</span>
						<input
							type="number"
							min={complexityBoundsStore.hardMin.max_arguments}
							max={complexityBoundsStore.max.max_arguments}
							value={complexityBoundsStore.min.max_arguments}
							oninput={updateMinArgs}
						/>
					</label>
					<span class="range-sep">…</span>
					<label>
						<span class="tiny">{m.settings_bounds_max()}</span>
						<input
							type="number"
							min={complexityBoundsStore.min.max_arguments}
							max={complexityBoundsStore.hardMax.max_arguments}
							value={complexityBoundsStore.max.max_arguments}
							oninput={updateMaxArgs}
						/>
					</label>
					<span class="hard-limits mono">{m.settings_bounds_hard_limit({ min: complexityBoundsStore.hardMin.max_arguments, max: complexityBoundsStore.hardMax.max_arguments })}</span>
				</div>
			</div>
		</div>
	</div>

	<div class="card stack">
		<div class="setting-group">
			<div class="setting-header">
				<h3 class="setting-label">{m.settings_categories_title()}</h3>
				<button class="btn btn-sm" onclick={resetCategories}>{m.settings_bounds_reset()}</button>
			</div>
			<p class="setting-hint">{m.settings_categories_hint()}</p>
		</div>

		<div class="categories-list">
			{#each categoriesStore.list as cat}
				<div class="category-item">
					<span class="tag">{cat}</span>
					<button class="remove-btn" onclick={() => removeCategory(cat)} title={m.settings_categories_remove_title()}>&times;</button>
				</div>
			{/each}
		</div>

		<form class="add-category-form" onsubmit={(e) => { e.preventDefault(); addCategory(); }}>
			<input type="text" bind:value={newCategory} placeholder={m.settings_categories_new_placeholder()} class="category-input" />
			<button class="btn btn-primary btn-sm" type="submit" disabled={!newCategory.trim()}>{m.settings_categories_add()}</button>
		</form>
	</div>

	<div class="card stack">
		<div class="setting-group">
			<h3 class="setting-label">{m.settings_admin_title()}</h3>
			<p class="setting-hint">{m.settings_admin_hint()}</p>
		</div>
		<a href="/admin" class="admin-link">{m.settings_admin_link()}</a>
	</div>

	<div class="card stack">
		<div class="setting-group">
			<h3 class="setting-label">{m.settings_about_title()}</h3>
			<p class="setting-hint">{m.settings_about_hint()}</p>
		</div>
	</div>
</section>

<style>
	.setting-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.setting-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.setting-label {
		font-size: var(--text-base);
		font-weight: 600;
	}

	.setting-value {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		background: var(--color-bg);
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-md);
		word-break: break-all;
	}

	.mono {
		font-family: var(--font-mono);
	}

	.setting-hint {
		font-size: var(--text-sm);
		color: var(--color-text-light);
		line-height: 1.5;
	}

	.divider {
		border: none;
		border-top: 1px solid var(--color-border);
	}

	.role-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.5rem;
		font-size: var(--text-xs);
		font-weight: 600;
		border-radius: 9999px;
		background: #fef3c7;
		color: #92400e;
		width: fit-content;
	}

	.categories-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.category-item {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	.remove-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 50%;
		border: none;
		background: var(--color-reject-bg);
		color: var(--color-reject);
		font-size: var(--text-base);
		cursor: pointer;
		line-height: 1;
		transition: background var(--transition-fast);
	}

	.remove-btn:hover {
		background: var(--color-reject);
		color: white;
	}

	.add-category-form {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.category-input {
		flex: 1;
		max-width: 250px;
	}

	.bounds-grid {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.bound-row {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
		padding: 0.5rem 0;
	}

	.bound-label {
		font-size: var(--text-sm);
		font-weight: 500;
		min-width: 180px;
	}

	.bound-controls {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.bound-controls label {
		display: inline-flex;
		flex-direction: column;
		gap: 0.125rem;
		margin: 0;
	}

	.bound-controls input {
		width: 4.5rem;
		padding: 0.25rem 0.5rem;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}

	.tiny {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-light);
	}

	.range-sep {
		color: var(--color-text-light);
	}

	.hard-limits {
		font-size: var(--text-xs);
		color: var(--color-text-light);
	}

	.admin-link {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-primary);
		text-decoration: none;
	}
	.admin-link:hover {
		text-decoration: underline;
	}

	.pill-group {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.pill-btn {
		font-family: inherit;
		font-size: var(--text-sm);
		font-weight: 500;
		padding: 0.35rem 0.75rem;
		background: var(--color-bg);
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background var(--transition-fast), color var(--transition-fast),
			border-color var(--transition-fast);
	}

	.pill-btn:hover:not(.active) {
		color: var(--color-text);
		border-color: var(--color-text-muted);
	}

	.pill-btn.active {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
		cursor: default;
	}
</style>
