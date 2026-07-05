<script lang="ts">
	import type { Thesis, Category } from '$lib/models/types';
	import { complexityStore } from '$lib/stores/complexity.svelte';
	import { categoriesStore } from '$lib/stores/categories.svelte';
	import { activityStore } from '$lib/stores/activity.svelte';
	import ThesisCard from '$lib/components/ThesisCard.svelte';
	import { m } from '$lib/paraglide/messages';

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
		activityStore.set(data.activity ?? [], m.my_platform_activity());
	});

	let selectedFilter = $state<Category | null>(null);

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
		return categoriesStore.list
			.map((cat) => ({ name: cat, count: categoryCounts.get(cat) ?? 0 }))
			.filter((t) => t.count > 0)
			.sort((a, b) => b.count - a.count);
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

	let filteredTheses = $derived.by(() => {
		if (!selectedFilter) return allTheses;
		return allTheses.filter((t) => t.categories.includes(selectedFilter!));
	});

	let visibleTheses = $derived.by(() => {
		return filteredTheses.slice(0, complexityStore.settings.max_theses);
	});
</script>

<section class="page">
	<!-- Category drill-down tiles -->
	<div class="section">
		<div class="section-head">
			<h2 class="section-title">{m.top_filter_title()}</h2>
			{#if selectedFilter}
				<button class="clear-filter" onclick={() => (selectedFilter = null)}>
					{m.top_filter_clear()}
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

	<div class="section">
		<div class="section-head">
			{#if selectedFilter}
				<span class="section-filter-active">{selectedFilter}</span>
			{/if}
			<span class="section-meta">{m.top_list_count({ visible: visibleTheses.length, total: filteredTheses.length })}</span>
		</div>

		<div class="grid grid-2">
			{#each visibleTheses as thesis, i (thesis.id)}
				<div class="ranked-card">
					<span class="rank">#{i + 1}</span>
					<ThesisCard {thesis} heatRatio={heat[thesis.id] ?? 0} argumentCount={argumentCounts[thesis.id] ?? 0} />
				</div>
			{/each}
		</div>

		{#if visibleTheses.length === 0}
			<p class="empty-state">
				{#if selectedFilter}
					{m.top_empty_filtered({ category: selectedFilter })}
				{:else}
					{m.top_empty()}
				{/if}
			</p>
		{/if}

		{#if filteredTheses.length > visibleTheses.length}
			<p class="limit-note">{m.top_limit_note()}</p>
		{/if}
	</div>
</section>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
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
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text-muted);
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.section-filter-active {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-primary);
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

	.cat-tile[data-size='sm'] { font-size: var(--text-xs); }
	.cat-tile[data-size='md'] { font-size: var(--text-sm); }
	.cat-tile[data-size='lg'] { font-size: var(--text-sm); font-weight: 600; }

	.cat-tile-name {
		text-transform: capitalize;
		font-weight: inherit;
	}

	.cat-tile-count {
		font-size: 0.75em;
		font-family: var(--font-mono);
		color: var(--color-text-light);
	}

	.ranked-card {
		position: relative;
	}

	.rank {
		position: absolute;
		top: -0.75rem;
		left: -0.75rem;
		background: var(--color-primary);
		color: white;
		font-size: var(--text-sm);
		font-weight: 700;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		min-width: 2rem;
		height: 2rem;
		padding: 0 0.5rem;
		border-radius: 9999px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		z-index: 1;
		border: 2px solid var(--color-surface);
		box-shadow: var(--shadow-sm);
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: 2rem 1rem;
	}

	.limit-note {
		text-align: center;
		font-size: var(--text-xs);
		color: var(--color-text-light);
		padding: 0.25rem;
		margin: 0;
	}
</style>
