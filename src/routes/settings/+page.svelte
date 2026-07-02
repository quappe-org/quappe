<script lang="ts">
	import { getUserId } from '$lib/stores/user';
	import { categoriesStore } from '$lib/stores/categories.svelte';
	import { complexityBoundsStore } from '$lib/stores/complexity-bounds.svelte';

	let userId = $state('');
	$effect(() => {
		userId = getUserId();
	});

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
			<h3 class="setting-label">Your Anonymous ID</h3>
			<p class="setting-value mono">{userId}</p>
			<p class="setting-hint">This is your unique identity. It's stored locally and never shared visibly.</p>
		</div>

		<hr class="divider" />

		<div class="setting-group">
			<h3 class="setting-label">Role</h3>
			<span class="role-badge">Admin</span>
			<p class="setting-hint">In MVP mode, all users are admins.</p>
		</div>
	</div>

	<div class="card stack">
		<div class="setting-group">
			<div class="setting-header">
				<h3 class="setting-label">Complexity slider bounds</h3>
				<button class="btn btn-sm" onclick={() => complexityBoundsStore.reset()}>Reset to defaults</button>
			</div>
			<p class="setting-hint">
				Adjust the min and max limits of the slider. The slider itself stays 0-100 but is
				mapped to the range you configure here.
			</p>
		</div>

		<div class="bounds-grid">
			<div class="bound-row">
				<span class="bound-label">Theses visible</span>
				<div class="bound-controls">
					<label>
						<span class="tiny">min</span>
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
						<span class="tiny">max</span>
						<input
							type="number"
							min={complexityBoundsStore.min.max_theses}
							max={complexityBoundsStore.hardMax.max_theses}
							value={complexityBoundsStore.max.max_theses}
							oninput={updateMaxTheses}
						/>
					</label>
					<span class="hard-limits mono">hard limit: {complexityBoundsStore.hardMin.max_theses} – {complexityBoundsStore.hardMax.max_theses}</span>
				</div>
			</div>

			<div class="bound-row">
				<span class="bound-label">Arguments per stance</span>
				<div class="bound-controls">
					<label>
						<span class="tiny">min</span>
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
						<span class="tiny">max</span>
						<input
							type="number"
							min={complexityBoundsStore.min.max_arguments}
							max={complexityBoundsStore.hardMax.max_arguments}
							value={complexityBoundsStore.max.max_arguments}
							oninput={updateMaxArgs}
						/>
					</label>
					<span class="hard-limits mono">hard limit: {complexityBoundsStore.hardMin.max_arguments} – {complexityBoundsStore.hardMax.max_arguments}</span>
				</div>
			</div>
		</div>
	</div>

	<div class="card stack">
		<div class="setting-group">
			<div class="setting-header">
				<h3 class="setting-label">Categories</h3>
				<button class="btn btn-sm" onclick={resetCategories}>Reset to defaults</button>
			</div>
			<p class="setting-hint">Manage the available categories for theses. Add or remove as needed.</p>
		</div>

		<div class="categories-list">
			{#each categoriesStore.list as cat}
				<div class="category-item">
					<span class="tag">{cat}</span>
					<button class="remove-btn" onclick={() => removeCategory(cat)} title="Remove category">&times;</button>
				</div>
			{/each}
		</div>

		<form class="add-category-form" onsubmit={(e) => { e.preventDefault(); addCategory(); }}>
			<input type="text" bind:value={newCategory} placeholder="New category name..." class="category-input" />
			<button class="btn btn-primary btn-sm" type="submit" disabled={!newCategory.trim()}>Add</button>
		</form>
	</div>

	<div class="card stack">
		<div class="setting-group">
			<h3 class="setting-label">Admin tools</h3>
			<p class="setting-hint">Available in MVP for everyone. Will be role-gated later.</p>
		</div>
		<a href="/admin" class="admin-link">Server logs console →</a>
	</div>

	<div class="card stack">
		<div class="setting-group">
			<h3 class="setting-label">About Quappe</h3>
			<p class="setting-hint">
				Quappe is an argumentation platform. State theses, provide arguments, and find
				commonality through structured discourse. No usernames. No comment wars. Just arguments.
			</p>
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
</style>
