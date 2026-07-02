import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getThesisById, updateThesis, deleteThesis, computeVoteSummary } from '$lib/stores/data';

export const GET: RequestHandler = async ({ params }) => {
	const thesis = getThesisById(params.id);

	if (!thesis) {
		return json({ error: 'Thesis not found' }, { status: 404 });
	}

	const voteSummary = computeVoteSummary(thesis.votes);

	return json({ ...thesis, vote_summary: voteSummary });
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const { title, description, categories, user_id } = body;

	const result = updateThesis(params.id, { title, description, categories }, user_id);

	if ('error' in result) {
		return json({ error: result.error }, { status: 403 });
	}

	return json(result);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const deleted = deleteThesis(params.id);

	if (!deleted) {
		return json({ error: 'Thesis not found' }, { status: 404 });
	}

	return json({ success: true }, { status: 200 });
};
