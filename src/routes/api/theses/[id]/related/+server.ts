import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getThesisById,
	getThesesWithEmbeddings,
	getAllTheses,
	setThesisEmbedding,
	hasThesisEmbedding
} from '$lib/stores/data';
import { embed, isModelWarm } from '$lib/server/embeddings';
import { findSimilarTheses } from '$lib/server/similarity';
import type { Thesis } from '$lib/models/types';

/**
 * Return theses that are topically related to :id.
 * Strategy:
 *  1. If model is warm and we have an embedding for :id → cosine-similarity ranking.
 *  2. If model is warm but no embedding yet → compute one, then rank.
 *  3. Otherwise fall back to shared-category overlap.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const thesis = getThesisById(params.id);
	if (!thesis) return json({ error: 'Thesis not found' }, { status: 404 });

	const limit = Math.max(1, Math.min(20, parseInt(url.searchParams.get('limit') ?? '5', 10)));

	// --- Semantic path ---
	if (isModelWarm()) {
		try {
			// Make sure the source thesis is embedded
			if (!hasThesisEmbedding(thesis.id)) {
				const vec = await embed(`${thesis.title} ${thesis.description}`, 'passage');
				setThesisEmbedding(thesis.id, vec);
			}
			const candidates = getThesesWithEmbeddings();
			const self = candidates.find((c) => c.thesis.id === thesis.id);
			if (self) {
				const similar = findSimilarTheses(self.embedding, candidates, limit, thesis.id);
				if (similar.length > 0) {
					return json({
						mode: 'semantic',
						results: similar.map((s) => ({ thesis: s.thesis, score: s.score }))
					});
				}
			}
		} catch {
			// fall through
		}
	}

	// --- Category-overlap fallback ---
	const catSet = new Set(thesis.categories);
	const scored = getAllTheses()
		.filter((t) => t.id !== thesis.id && !t.archived)
		.map((t): { thesis: Thesis; score: number } => {
			const shared = t.categories.filter((c) => catSet.has(c)).length;
			return { thesis: t, score: shared / Math.max(catSet.size, t.categories.length, 1) };
		})
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);

	return json({ mode: 'categories', results: scored });
};
