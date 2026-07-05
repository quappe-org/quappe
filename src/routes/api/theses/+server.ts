import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getAllTheses,
	getTrendingTheses,
	getTopTheses,
	createThesis,
	setThesisEmbedding,
	seedData
} from '$lib/stores/data';
import { embed, isModelWarm } from '$lib/server/embeddings';
import { suggestCategories } from '$lib/server/similarity';
import { DEFAULT_CATEGORIES } from '$lib/models/types';

export const GET: RequestHandler = async ({ url }) => {
	seedData();

	const trending = url.searchParams.get('trending');
	const top = url.searchParams.get('top');
	const limitParam = url.searchParams.get('limit');
	const limit = limitParam ? parseInt(limitParam, 10) : 10;

	if (trending === 'true') {
		return json(getTrendingTheses(limit));
	}

	if (top === 'true') {
		return json(getTopTheses(limit));
	}

	let theses = getAllTheses();
	if (limitParam) {
		theses = theses.slice(0, limit);
	}

	return json(theses);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { title, description, categories, location, author_id } = body;

	if (!title || !description || !categories) {
		return json({ error: 'Missing required fields: title, description, categories' }, { status: 400 });
	}

	const final_author_id = author_id || crypto.randomUUID();
	const thesis = createThesis(title, description, categories, final_author_id, location);

	// Try to compute suggestion within a bounded time budget so the response
	// stays snappy but users get suggestions on the first thesis they create
	// (before the model has been "warmed" by any prior request).
	const text = `${title} ${description}`;
	let suggested_categories: string[] = [];

	const embedPromise = embed(text, 'passage').then((vec) => {
		setThesisEmbedding(thesis.id, vec);
		return vec;
	});
	// Suppress unhandled-rejection if we time out
	embedPromise.catch(() => {});

	const budgetMs = isModelWarm() ? 5000 : 3000;
	const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), budgetMs));

	try {
		const vec = await Promise.race([embedPromise, timeout]);
		if (vec) {
			suggested_categories = await suggestCategories(vec, DEFAULT_CATEGORIES, 3);
		}
	} catch {
		// embedding failed — continue without suggestion
	}

	return json({ ...thesis, suggested_categories }, { status: 201 });
};
