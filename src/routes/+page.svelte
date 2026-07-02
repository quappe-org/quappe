<script lang="ts">
	import type { Thesis, Category } from '$lib/models/types';
	import { complexityStore } from '$lib/stores/complexity.svelte';
	import { categoriesStore } from '$lib/stores/categories.svelte';
	import { budgetStore } from '$lib/stores/budget.svelte';
	import { activityStore } from '$lib/stores/activity.svelte';
	import { uiIntents } from '$lib/stores/ui.svelte';
	import { getUserId } from '$lib/stores/user';
	import ThesisCard from '$lib/components/ThesisCard.svelte';
	import type { ActivityDay } from '$lib/stores/data';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	let allTheses = $state<Thesis[]>(data.theses ?? []);
	// svelte-ignore state_referenced_locally
	let heat = $state<Record<string, number>>(data.heat ?? {});
	// svelte-ignore state_referenced_locally
	let argumentCounts = $state<Record<string, number>>(data.argumentCounts ?? {});
	$effect(() => {
		allTheses = data.theses;
		heat = data.heat ?? {};
		argumentCounts = data.argumentCounts ?? {};
		activityStore.set(data.activity ?? [], 'Platform activity');
	});

	// Listen for external "new thesis" intent (from sidebar button)
	$effect(() => {
		if (uiIntents.openNewThesis) {
			showForm = true;
			uiIntents.consumeNewThesis();
			// Scroll to form after render
			setTimeout(() => {
				document.querySelector('.create-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}, 50);
		}
	});

	let selectedFilter = $state<Category | null>(null);

	// Count theses per category for drill-down tiles
	let categoryCounts = $derived.by(() => {
		const counts = new Map<Category, number>();
		for (const cat of categoriesStore.list) counts.set(cat, 0);
		for (const t of allTheses) {
			for (const cat of t.categories) {
				counts.set(cat, (counts.get(cat) ?? 0) + 1);
			}
		}
		return counts;
	});

	let categoryTiles = $derived.by(() => {
		const tiles = categoriesStore.list
			.map((cat) => ({ name: cat, count: categoryCounts.get(cat) ?? 0 }))
			.filter((t) => t.count > 0)
			.sort((a, b) => b.count - a.count);
		return tiles;
	});

	let maxCategoryCount = $derived.by(() => {
		let m = 0;
		for (const t of categoryTiles) if (t.count > m) m = t.count;
		return m || 1;
	});

	function tileSize(count: number): 'lg' | 'md' | 'sm' {
		const ratio = count / maxCategoryCount;
		if (ratio >= 0.66) return 'lg';
		if (ratio >= 0.33) return 'md';
		return 'sm';
	}

	let visibleTheses = $derived.by(() => {
		let filtered = allTheses;
		if (selectedFilter) {
			filtered = filtered.filter((t) => t.categories.includes(selectedFilter!));
		}
		return filtered.slice(0, complexityStore.settings.max_theses);
	});

	let filteredTotal = $derived.by(() => {
		if (!selectedFilter) return allTheses.length;
		return allTheses.filter((t) => t.categories.includes(selectedFilter!)).length;
	});

	let showForm = $state(false);
	let title = $state('');
	let description = $state('');
	let selectedCategories = $state<Category[]>([]);
	let submitting = $state(false);

	function toggleCategory(cat: Category) {
		if (selectedCategories.includes(cat)) {
			selectedCategories = selectedCategories.filter((c) => c !== cat);
		} else {
			selectedCategories = [...selectedCategories, cat];
		}
	}

	async function createThesis() {
		if (!title.trim() || !description.trim() || selectedCategories.length === 0) return;
		if (!budgetStore.canCreate('thesis')) return;
		submitting = true;
		try {
			const res = await fetch('/api/theses', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: title.trim(),
					description: description.trim(),
					categories: selectedCategories,
					author_id: getUserId()
				})
			});
			if (res.ok) {
				const newThesis: Thesis = await res.json();
				budgetStore.spend('thesis');
				allTheses = [newThesis, ...allTheses];
				title = '';
				description = '';
				selectedCategories = [];
				showForm = false;
			}
		} finally {
			submitting = false;
		}
	}
</script>

<section class="page">
	<header class="page-head">
		<div>
			<h1 class="page-title">Trending</h1>
			<p class="page-subtitle">Explore theses, find common ground, sharpen your reasoning.</p>
		</div>
	</header>

	<!-- Category drill-down tiles -->
	<div class="section">
		<div class="section-head">
			<h2 class="section-title">Categories</h2>
			{#if selectedFilter}
				<button class="clear-filter" onclick={() => (selectedFilter = null)}>
					&times; Clear filter
				</button>
			{/if}
		</div>
		<div class="category-tiles">
			{#each categoryTiles as tile}
				<button
					class="cat-tile"
					data-size={tileSize(tile.count)}
					class:active={selectedFilter === tile.name}
					onclick={() => (selectedFilter = selectedFilter === tile.name ? null : tile.name)}
				>
					<span class="cat-tile-name">{tile.name}</span>
					<span class="cat-tile-count">{tile.count}</span>
				</button>
			{/each}
		</div>
	</div>

	{#if showForm}
		<form class="card create-form" onsubmit={(e) => { e.preventDefault(); createThesis(); }}>
			<h2 class="form-title">Create a Thesis</h2>

			<div class="form-group">
				<label for="thesis-title">Title</label>
				<input id="thesis-title" type="text" bind:value={title} placeholder="State your thesis clearly..." required />
			</div>

			<div class="form-group">
				<label for="thesis-desc">Description</label>
				<textarea id="thesis-desc" bind:value={description} placeholder="Provide context and nuance..." required></textarea>
			</div>

			<div class="form-group">
				<label for="thesis-categories">Categories</label>
				<div class="category-grid" id="thesis-categories">
					{#each categoriesStore.list as cat}
						<button
							type="button"
							class="tag category-btn"
							class:selected={selectedCategories.includes(cat)}
							onclick={() => toggleCategory(cat)}
						>{cat}</button>
					{/each}
				</div>
			</div>

			<div class="form-actions">
				<button class="btn btn-primary" type="submit" disabled={submitting}>
					{submitting ? 'Creating...' : 'Create Thesis'}
				</button>
				<button class="btn" type="button" onclick={() => (showForm = false)}>Cancel</button>
			</div>
		</form>
	{/if}

	<!-- Theses list -->
	<div class="section">
		<div class="section-head">
			<h2 class="section-title">
				{selectedFilter ? selectedFilter : 'All theses'}
			</h2>
			<span class="section-meta">
				{visibleTheses.length} of {filteredTotal}
			</span>
		</div>

		<div class="grid grid-2">
			{#each visibleTheses as thesis (thesis.id)}
				<ThesisCard {thesis} heatRatio={heat[thesis.id] ?? 0} argumentCount={argumentCounts[thesis.id] ?? 0} />
			{/each}
		</div>

		{#if visibleTheses.length === 0}
			<p class="empty-state">
				{#if selectedFilter}
					No theses in category "{selectedFilter}".
				{:else}
					No theses yet. Be the first to create one!
				{/if}
			</p>
		{/if}

		{#if filteredTotal > visibleTheses.length}
			<p class="limit-note">
				Adjust the complexity slider to see more theses.
			</p>
		{/if}
	</div>
</section>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.page-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.page-title {
		font-size: var(--text-2xl);
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}

	.page-subtitle {
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		margin: 0.125rem 0 0;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.section-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}

	.section-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
		text-transform: capitalize;
	}

	.section-meta {
		font-size: var(--text-xs);
		color: var(--color-text-light);
		font-family: var(--font-mono);
	}

	.clear-filter {
		background: none;
		border: none;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-sm);
	}

	.clear-filter:hover {
		color: var(--color-reject);
		background: var(--color-reject-bg);
	}

	/* Category chips - horizontal scrollable, no wrapping */
	.category-tiles {
		display: flex;
		gap: 0.375rem;
		overflow-x: auto;
		padding: 0.25rem 0.125rem 0.5rem;
		scrollbar-width: thin;
		scrollbar-color: var(--color-border) transparent;
		-webkit-overflow-scrolling: touch;
	}
	.category-tiles::-webkit-scrollbar { height: 4px; }
	.category-tiles::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 2px; }

	.cat-tile {
		display: inline-flex;
		align-items: baseline;
		gap: 0.375rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 9999px;
		padding: 0.25rem 0.75rem;
		cursor: pointer;
		transition: all var(--transition-fast);
		font-family: inherit;
		color: var(--color-text-muted);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.cat-tile:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.cat-tile.active {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}

	.cat-tile.active .cat-tile-count {
		color: rgba(255, 255, 255, 0.85);
	}

	/* Size still hints at popularity, but via subtle font/weight - no vertical growth. */
	.cat-tile[data-size='sm'] {
		font-size: var(--text-xs);
	}
	.cat-tile[data-size='md'] {
		font-size: var(--text-sm);
	}
	.cat-tile[data-size='lg'] {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.cat-tile-name {
		text-transform: capitalize;
		font-weight: inherit;
	}

	.cat-tile-count {
		font-size: 0.75em;
		font-family: var(--font-mono);
		color: var(--color-text-light);
	}

	.create-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-actions {
		display: flex;
		gap: 0.5rem;
	}

	.form-title {
		font-size: var(--text-lg);
		font-weight: 600;
		margin: 0;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.category-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.category-btn {
		cursor: pointer;
		border: 1px solid var(--color-border);
		transition: all var(--transition-fast);
	}

	.category-btn.selected {
		background: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: 2rem 1rem;
		font-size: var(--text-base);
	}

	.limit-note {
		text-align: center;
		font-size: var(--text-xs);
		color: var(--color-text-light);
		padding: 0.25rem;
		margin: 0;
	}
</style>
