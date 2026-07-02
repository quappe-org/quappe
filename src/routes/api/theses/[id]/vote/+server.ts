import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { voteOnThesis, computeVoteSummary } from '$lib/stores/data';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const { type, weight } = body;
	const user_id = body.user_id || crypto.randomUUID();

	if (!type || !['support', 'reject', 'neutral'].includes(type)) {
		return json({ error: 'Invalid vote type. Must be support, reject, or neutral.' }, { status: 400 });
	}

	const w = typeof weight === 'number' ? Math.max(1, Math.min(5, Math.floor(weight))) : 1;
	const thesis = voteOnThesis(params.id, user_id, type, w);

	if (!thesis) {
		return json({ error: 'Thesis not found' }, { status: 404 });
	}

	const voteSummary = computeVoteSummary(thesis.votes);

	return json({ vote_summary: voteSummary, user_id, weight: w }, { status: 200 });
};
