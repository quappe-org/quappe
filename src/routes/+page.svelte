<script lang="ts">
	import type { Thesis, Category } from '$lib/models/types';
	import { complexityStore } from '$lib/stores/complexity.svelte';
	import { categoriesStore } from '$lib/stores/categories.svelte';
	import { activityStore } from '$lib/stores/activity.svelte';
	import { uiIntents } from '$lib/stores/ui.svelte';
	import { getUserId } from '$lib/stores/user';
	import ThesisCard from '$lib/components/ThesisCard.svelte';
	import type { ActivityDay } from '$lib/stores/data';
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
		activityStore.set([], '');
	});

	// Listen for external "new thesis" intent (from sidebar button)
	let _lastSeenIntent = $state(0);
	$effect(() => {
		const count = uiIntents.openNewThesis;
		if (count > _lastSeenIntent) {
			_lastSeenIntent = count;
			showForm = true;
			setTimeout(() => {
				document.querySelector('.create-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}, 50);
		}
	});

	// ---- Search ----
	let searchQuery = $state('');
	let searchResults = $state<Thesis[]>([]);
	let searchMode = $state<'semantic' | 'fulltext' | 'combined' | 'empty' | null>(null);
	let searching = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	function onSearchInput() {
		if (searchTimer) clearTimeout(searchTimer);
		const q = searchQuery.trim();
		if (q.length < 2) {
			searchResults = [];
			searchMode = null;
			return;
		}
		searchTimer = setTimeout(async () => {
			searching = true;
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
				if (res.ok) {
					const data = await res.json();
					searchResults = data.results ?? [];
					searchMode = data.mode ?? null;
				}
			} finally {
				searching = false;
			}
		}, 300);
	}

	let isSearching = $derived(searchQuery.trim().length >= 2);

	// ---- Filter ----
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

	// ---- Thesis form ----
	let showForm = $state(false);
	let title = $state('');
	let description = $state('');
	let selectedCategories = $state<Category[]>([]);
	let suggestedCategories = $state<Category[]>([]);
	let suggestedForThesis = $state<{ id: string; currentCategories: Category[] } | null>(null);
	let submitting = $state(false);
	let createError = $state<string | null>(null);

	// Live "already exists?" hint while the user is typing the new thesis
	let similarExisting = $state<Thesis[]>([]);
	let similarLoading = $state(false);
	let similarTimer: ReturnType<typeof setTimeout> | null = null;
	let similarSeq = 0;

	function onFormTyping() {
		if (similarTimer) clearTimeout(similarTimer);
		const combined = `${title.trim()} ${description.trim()}`.trim();
		if (combined.length < 8) {
			similarExisting = [];
			similarLoading = false;
			return;
		}
		similarLoading = true;
		const mySeq = ++similarSeq;
		similarTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(combined)}`);
				if (!res.ok) return;
				const payload = await res.json();
				if (mySeq !== similarSeq) return;
				similarExisting = (payload.results ?? []).slice(0, 5);
			} finally {
				if (mySeq === similarSeq) similarLoading = false;
			}
		}, 400);
	}

	function toggleCategory(cat: Category) {
		if (selectedCategories.includes(cat)) {
			selectedCategories = selectedCategories.filter((c) => c !== cat);
		} else {
			selectedCategories = [...selectedCategories, cat];
		}
	}

	async function applySuggested() {
		if (!suggestedForThesis) {
			suggestedCategories = [];
			return;
		}
		const merged = Array.from(new Set([...suggestedForThesis.currentCategories, ...suggestedCategories]));
		try {
			const res = await fetch(`/api/theses/${suggestedForThesis.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ categories: merged, user_id: getUserId() })
			});
			if (res.ok) {
				const updated = await res.json();
				allTheses = allTheses.map((t) => (t.id === updated.id ? updated : t));
			}
		} finally {
			suggestedCategories = [];
			suggestedForThesis = null;
		}
	}

	async function createThesis() {
		if (!title.trim() || !description.trim()) return;
		submitting = true;
		createError = null;
		// Server requires ≥1 category. If the user didn't pick, fall back to
		// 'other' up-front — the LLM suggestion (if confident) will replace it
		// via the PUT below.
		const payloadCategories = selectedCategories.length > 0 ? selectedCategories : ['other'];
		try {
			const res = await fetch('/api/theses', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: title.trim(),
					description: description.trim(),
					categories: payloadCategories,
					author_id: getUserId()
				})
			});
			if (!res.ok) {
				if (res.status === 429) {
					createError = m.error_too_many_requests();
				} else if (res.status === 413) {
					createError = m.error_text_too_long();
				} else if (res.status === 400) {
					const body = await res.json().catch(() => ({}));
					createError = body?.error ?? m.error_invalid_input();
				} else {
					createError = m.error_server_generic({ status: res.status });
				}
				return;
			}
			const responseData = await res.json();
			const suggested: Category[] = responseData.suggested_categories ?? [];
			const currentCats = [...selectedCategories];

			// If the user picked no categories, auto-apply the server's suggestion
			// before showing the thesis in the list — this is what "just submit" expects.
			// Skip the PUT when the suggestion is just ['other'] (no confidence) since
			// the initial payload already defaulted to that.
			let finalThesis: Thesis = responseData;
			const suggestionIsFallback = suggested.length === 1 && suggested[0] === 'other';
			if (currentCats.length === 0 && suggested.length > 0 && !suggestionIsFallback) {
				try {
					const putRes = await fetch(`/api/theses/${responseData.id}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ categories: suggested, user_id: getUserId() })
					});
					if (putRes.ok) finalThesis = await putRes.json();
				} catch {
					// fall through with uncategorized thesis
				}
			}

			allTheses = [finalThesis, ...allTheses];

			// Banner: only show if the suggestion adds something the user did NOT
			// pick. If we already auto-applied above (empty selection), skip.
			if (currentCats.length > 0) {
				const novel = suggested.filter((c) => !currentCats.includes(c));
				if (novel.length > 0) {
					suggestedCategories = novel;
					suggestedForThesis = { id: finalThesis.id, currentCategories: currentCats };
				} else {
					suggestedCategories = [];
					suggestedForThesis = null;
				}
			} else {
				suggestedCategories = [];
				suggestedForThesis = null;
			}

			title = '';
			description = '';
			selectedCategories = [];
			similarExisting = [];
			showForm = false;
		} finally {
			submitting = false;
		}
	}
</script>

<section class="page">
	<!-- Search -->
	<div class="search-wrap">
		<div class="search-box">
			<svg class="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
			<input
				type="search"
				class="search-input"
				placeholder={m.home_search_placeholder()}
				bind:value={searchQuery}
				oninput={onSearchInput}
				maxlength="200"
			/>
			{#if searching}
				<span class="search-spinner" aria-label={m.home_search_searching_aria()}></span>
			{/if}
		</div>
	</div>

	{#if suggestedCategories.length > 0}
		<div class="suggestion-banner">
			<span class="suggestion-label">{m.home_suggestion_label()}</span>
			{#each suggestedCategories as cat}
				<span class="suggestion-cat">{cat}</span>
			{/each}
			<button class="btn btn-sm suggestion-apply" onclick={applySuggested}>{m.home_suggestion_apply()}</button>
			<button class="suggestion-dismiss" aria-label={m.home_suggestion_dismiss_aria()} onclick={() => { suggestedCategories = []; suggestedForThesis = null; }}>×</button>
		</div>
	{/if}

	{#if isSearching}
		<!-- Search results -->
		<div class="section">
			<div class="section-head">
				<span class="section-filter-active">
					{searchMode === 'semantic' ? m.home_search_mode_semantic() : searchMode === 'fulltext' ? m.home_search_mode_fulltext() : m.home_search_mode_combined()}
				</span>
				<span class="section-meta">{m.home_search_hits({ count: searchResults.length })}</span>
			</div>
			{#if searchResults.length > 0}
				<div class="grid grid-2">
					{#each searchResults as thesis (thesis.id)}
						<ThesisCard {thesis} heatRatio={heat[thesis.id] ?? 0} argumentCount={argumentCounts[thesis.id] ?? 0} />
					{/each}
				</div>
			{:else if !searching}
				<p class="empty-state">{m.home_search_no_matches({ query: searchQuery })}</p>
			{/if}
		</div>
	{:else}
		<!-- Category drill-down tiles -->
		<div class="section">
			<div class="section-head">
				<h2 class="section-title">{m.home_filter_title()}</h2>
				{#if selectedFilter}
					<button class="clear-filter" onclick={() => (selectedFilter = null)}>
						&times; {m.home_filter_clear()}
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
				<div class="form-header">
					<h2 class="form-title">{m.home_create_title()}</h2>
					<button
						type="button"
						class="form-close"
						aria-label={m.home_create_close_aria()}
						title={m.home_create_close_aria()}
						onclick={() => { showForm = false; similarExisting = []; createError = null; }}
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
					</button>
				</div>

				<div class="form-group">
					<label for="thesis-title">{m.home_create_title_label()}</label>
					<input id="thesis-title" type="text" bind:value={title} oninput={onFormTyping} placeholder={m.home_create_title_placeholder()} maxlength="200" required />
				</div>

				<div class="form-group">
					<label for="thesis-desc">{m.home_create_desc_label()}</label>
					<textarea id="thesis-desc" bind:value={description} oninput={onFormTyping} placeholder={m.home_create_desc_placeholder()} maxlength="2000" required></textarea>
				</div>

				{#if similarLoading || similarExisting.length > 0}
					<div class="similar-existing">
						<div class="similar-head">
							<span class="similar-label">{m.home_create_similar_label()}</span>
							{#if similarLoading}
								<span class="search-spinner" aria-label={m.home_search_searching_aria()}></span>
							{/if}
						</div>
						{#if similarExisting.length > 0}
							<ul class="similar-list">
								{#each similarExisting as ex (ex.id)}
									<li>
										<a class="similar-link" href="/thesis/{ex.id}">
											<span class="similar-thesis-title">{ex.title}</span>
											<span class="similar-cats">
												{#each ex.categories.slice(0, 3) as cat}
													<span class="similar-cat">{cat}</span>
												{/each}
											</span>
										</a>
									</li>
								{/each}
							</ul>
						{:else if !similarLoading}
							<p class="similar-empty">{m.home_create_similar_empty()}</p>
						{/if}
					</div>
				{/if}

				<div class="form-group">
					<label for="thesis-categories">
						{m.home_create_categories_label()}
						<span class="hint-inline">{m.home_create_categories_hint()}</span>
					</label>
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
						{submitting ? m.home_create_submitting() : m.home_create_submit()}
					</button>
					<button class="btn" type="button" onclick={() => { showForm = false; similarExisting = []; createError = null; }}>{m.home_create_cancel()}</button>
				</div>

				{#if createError}
					<p class="create-error" role="alert">{createError}</p>
				{/if}
			</form>
		{/if}

		<!-- Theses list -->
		<div class="section">
			<div class="section-head">
				{#if selectedFilter}
					<span class="section-filter-active">{selectedFilter}</span>
				{/if}
				<span class="section-meta">
					{m.home_list_count({ visible: visibleTheses.length, total: filteredTotal })}
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
						{m.home_list_empty_filtered({ category: selectedFilter })}
					{:else}
						{m.home_list_empty()}
					{/if}
				</p>
			{/if}

			{#if filteredTotal > visibleTheses.length}
				<p class="limit-note">
					{m.home_list_limit_note()}
				</p>
			{/if}
		</div>
	{/if}
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

	.create-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-actions {
		display: flex;
		gap: 0.5rem;
	}

	.create-error {
		margin: 0;
		padding: 0.5rem 0.75rem;
		background: var(--color-reject-bg);
		border: 1px solid var(--color-reject);
		border-radius: var(--radius-md);
		color: var(--color-reject);
		font-size: var(--text-sm);
	}

	.form-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.form-title {
		font-size: var(--text-lg);
		font-weight: 600;
		margin: 0;
	}

	.form-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 1px solid transparent;
		background: transparent;
		color: var(--color-text-muted);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.form-close:hover {
		background: var(--color-reject-bg);
		border-color: var(--color-reject);
		color: var(--color-reject);
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

	/* Search */
	.search-wrap {
		position: relative;
	}

	.search-box {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.75rem;
		transition: border-color var(--transition-fast);
	}

	.search-box:focus-within {
		border-color: var(--color-primary);
	}

	.search-icon {
		color: var(--color-text-light);
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		border: none;
		background: transparent;
		font-size: var(--text-sm);
		color: var(--color-text);
		outline: none;
		min-width: 0;
	}

	.search-input::placeholder {
		color: var(--color-text-light);
	}

	.search-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Category suggestion banner */
	.suggestion-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		background: var(--color-primary-bg, color-mix(in srgb, var(--color-primary) 8%, transparent));
		border: 1px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.75rem;
		font-size: var(--text-sm);
	}

	.suggestion-label {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.suggestion-cat {
		background: var(--color-primary);
		color: white;
		font-size: var(--text-xs);
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		text-transform: capitalize;
	}

	.suggestion-apply {
		margin-left: auto;
	}

	.suggestion-dismiss {
		background: none;
		border: none;
		color: var(--color-text-light);
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
		padding: 0.125rem 0.25rem;
		border-radius: var(--radius-sm);
	}

	.suggestion-dismiss:hover {
		color: var(--color-text);
	}

	.hint-inline {
		font-weight: 400;
		font-size: 0.7rem;
		color: var(--color-text-light);
		margin-left: 0.4rem;
		text-transform: none;
		letter-spacing: 0;
	}

	/* Similar-existing-thesis hint inside the create form */
	.similar-existing {
		background: var(--color-bg);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.similar-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.similar-label {
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}

	.similar-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.similar-link {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.35rem 0.4rem;
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: var(--color-text);
		transition: background var(--transition-fast);
	}

	.similar-link:hover {
		background: var(--color-surface);
	}

	.similar-thesis-title {
		font-size: var(--text-sm);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.similar-cats {
		display: flex;
		gap: 0.2rem;
		flex-shrink: 0;
	}

	.similar-cat {
		font-size: 0.65rem;
		font-family: var(--font-mono);
		color: var(--color-text-light);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 9999px;
		padding: 0.05rem 0.4rem;
		text-transform: capitalize;
	}

	.similar-empty {
		font-size: var(--text-xs);
		color: var(--color-text-light);
		margin: 0;
	}
</style>
