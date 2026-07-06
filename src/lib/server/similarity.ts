// Similarity utilities — cosine similarity, nearest-neighbor search, category suggestion
// All pure functions operating on pre-computed Float32Array embeddings.

import type { Thesis, Argument, Category } from '$lib/models/types';
import { embed, isModelWarm } from './embeddings';

// ---- Core math ----

/** Dot product of two normalized vectors = cosine similarity */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	let sum = 0;
	for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
	return sum;
}

// ---- Category suggestion ----

// Cache of category embeddings so we don't re-embed on every request
const _catEmbeddingCache = new Map<string, Float32Array>();

async function getCategoryEmbedding(cat: string): Promise<Float32Array> {
	if (_catEmbeddingCache.has(cat)) return _catEmbeddingCache.get(cat)!;
	const vec = await embed(cat, 'passage');
	_catEmbeddingCache.set(cat, vec);
	return vec;
}

/**
 * Suggest the top N most relevant categories for a given text embedding.
 * Returns [] if model is not warm yet (non-blocking).
 *
 * Only categories whose cosine similarity to the text is above `minScore`
 * (default 0.35) are returned. If none clears the bar, we return ['other']
 * — better than a random top-3 that happens to be dressed up as confident.
 * The `'other'` sentinel is expected to exist in the caller's category list
 * (it is part of DEFAULT_CATEGORIES).
 */
export async function suggestCategories(
	textEmbedding: Float32Array,
	categories: Category[],
	topN = 2,
	minScore = 0.35
): Promise<Category[]> {
	if (!isModelWarm() || categories.length === 0) return [];

	const scores: { cat: Category; score: number }[] = await Promise.all(
		categories.map(async (cat) => {
			const vec = await getCategoryEmbedding(cat);
			return { cat, score: cosineSimilarity(textEmbedding, vec) };
		})
	);

	scores.sort((a, b) => b.score - a.score);
	const confident = scores.filter((s) => s.score >= minScore).slice(0, topN).map((s) => s.cat);
	if (confident.length > 0) return confident;
	return categories.includes('other') ? ['other'] : [];
}

// ---- Similar theses ----

export interface ScoredThesis {
	thesis: Thesis;
	score: number;
}

export function findSimilarTheses(
	queryEmbedding: Float32Array,
	candidates: { thesis: Thesis; embedding: Float32Array }[],
	topN = 5,
	excludeId?: string
): ScoredThesis[] {
	const scored: ScoredThesis[] = [];
	for (const { thesis, embedding } of candidates) {
		if (excludeId && thesis.id === excludeId) continue;
		scored.push({ thesis, score: cosineSimilarity(queryEmbedding, embedding) });
	}
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, topN).filter((s) => s.score > 0.4);
}

// ---- Similar arguments ----

export interface ScoredArgument {
	argument: Argument;
	score: number;
}

export function findSimilarArguments(
	queryEmbedding: Float32Array,
	candidates: { argument: Argument; embedding: Float32Array }[],
	topN = 3
): ScoredArgument[] {
	const scored: ScoredArgument[] = [];
	for (const { argument, embedding } of candidates) {
		scored.push({ argument, score: cosineSimilarity(queryEmbedding, embedding) });
	}
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, topN).filter((s) => s.score > 0.45);
}

// ---- Fulltext fallback ----

export function fulltextSearchTheses(query: string, theses: Thesis[], topN = 10): Thesis[] {
	const q = query.toLowerCase();
	return theses
		.filter(
			(t) =>
				t.title.toLowerCase().includes(q) ||
				t.description.toLowerCase().includes(q) ||
				t.categories.some((c) => c.toLowerCase().includes(q))
		)
		.slice(0, topN);
}
