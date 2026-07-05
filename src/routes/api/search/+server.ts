import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getThesesWithEmbeddings, getAllTheses, seedData } from '$lib/stores/data';
import { embed } from '$lib/server/embeddings';
import { findSimilarTheses, fulltextSearchTheses } from '$lib/server/similarity';
import { LIMITS, checkRate, getClientIp } from '$lib/server/limits';

export const GET: RequestHandler = async ({ url, request, getClientAddress }) => {
	seedData();

	const ip = getClientIp(request, getClientAddress());
	const rate = checkRate(ip, null, 'read');
	if (rate) return rate;

	const raw = url.searchParams.get('q')?.trim() ?? '';
	if (raw.length < 2) {
		return json({ results: [], mode: 'empty' });
	}
	// Cap query length before it hits the embedding model.
	const q = raw.length > LIMITS.search_query ? raw.slice(0, LIMITS.search_query) : raw;

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
