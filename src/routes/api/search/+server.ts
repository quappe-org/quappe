import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getThesesWithEmbeddings, getAllTheses, seedData } from '$lib/stores/data';
import { embed } from '$lib/server/embeddings';
import { findSimilarTheses, fulltextSearchTheses } from '$lib/server/similarity';

export const GET: RequestHandler = async ({ url }) => {
	seedData();

	const q = url.searchParams.get('q')?.trim() ?? '';
	if (q.length < 2) {
		return json({ results: [], mode: 'empty' });
	}

	const candidates = getThesesWithEmbeddings();

	// If we have enough embedded theses, use semantic search
	if (candidates.length >= 3) {
		try {
			const queryVec = await embed(q, 'query');
			const semantic = findSimilarTheses(queryVec, candidates, 10);

			// Supplement with fulltext if semantic results are sparse
			if (semantic.length < 3) {
				const allTheses = getAllTheses();
				const fulltext = fulltextSearchTheses(q, allTheses, 10).filter(
					(t) => !semantic.some((s) => s.thesis.id === t.id)
				);
				return json({
					results: [...semantic.map((s) => s.thesis), ...fulltext].slice(0, 10),
					mode: 'combined'
				});
			}

			return json({ results: semantic.map((s) => s.thesis), mode: 'semantic' });
		} catch {
			// Fall through to fulltext on embedding error
		}
	}

	// Fallback: fulltext search
	const allTheses = getAllTheses();
	return json({ results: fulltextSearchTheses(q, allTheses, 10), mode: 'fulltext' });
};
