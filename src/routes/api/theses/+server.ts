import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getAllTheses,
	getTrendingTheses,
	getTopTheses,
	createThesis,
	seedData
} from '$lib/stores/data';

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

	return json(thesis, { status: 201 });
};
