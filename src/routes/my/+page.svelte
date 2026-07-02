<script lang="ts">
	import type { Thesis } from '$lib/models/types';
	import { getUserId } from '$lib/stores/user';
	import { activityStore } from '$lib/stores/activity.svelte';
	import ThesisCard from '$lib/components/ThesisCard.svelte';

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

	let myTheses = $derived.by(() => {
		if (typeof window === 'undefined') return [];
		const userId = getUserId();
		return allTheses.filter(
			(t) => t.meta.author_id === userId || t.votes.some((v) => v.user_id === userId)
		);
	});
</script>

<section class="stack-lg">
	<div class="page-head">
		<h1 class="page-title">My Theses</h1>
		<p class="page-subtitle">Theses you created or voted on.</p>
	</div>

	<div class="grid grid-2">
		{#each myTheses as thesis (thesis.id)}
			<ThesisCard {thesis} heatRatio={heat[thesis.id] ?? 0} argumentCount={argumentCounts[thesis.id] ?? 0} />
		{/each}
	</div>

	{#if myTheses.length === 0}
		<p class="empty-state">You haven't participated yet. Go vote or create a thesis!</p>
	{/if}
</section>

<style>
	.page-head {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.page-title {
		font-size: var(--text-2xl);
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}

	.page-subtitle {
		color: var(--color-text-muted);
		font-size: var(--text-base);
		margin: 0;
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: 3rem 1rem;
		font-size: var(--text-lg);
	}
</style>
