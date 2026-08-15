import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { voteOnArgument, computeVoteSummary } from '$lib/stores/data';
import { checkRate, getClientIp } from '$lib/server/limits';
import { normalizeVoteWeight } from '$lib/models/fibonacci';
import { checkWeightBudget, checkIdentityMaturityForWeight } from '$lib/server/budget';

export const POST: RequestHandler = async ({ params, request, getClientAddress, locals, cookies }) => {
	const body = await request.json();
	const { type, weight } = body;
	const user_id = locals.user_id;

	const ip = getClientIp(request, getClientAddress());
	const rate = checkRate(ip, user_id, 'write_light');
	if (rate) return rate;

	if (!type || !['support', 'reject', 'neutral'].includes(type)) {
		return json({ error: 'Invalid vote type. Must be support, reject, or neutral.' }, { status: 400 });
	}

	const w = normalizeVoteWeight(weight);
	// Base weight-1 votes are free; extra weight draws from the daily weight pool.
	if (type === 'support' || type === 'reject') {
		const maturityErr = checkIdentityMaturityForWeight(cookies, w);
		if (maturityErr) return maturityErr;
		const budgetErr = checkWeightBudget(user_id, w);
		if (budgetErr) return budgetErr;
	}
	const argument = voteOnArgument(params.id, user_id, type, w);

	if (!argument) {
		return json({ error: 'Argument not found' }, { status: 404 });
	}

	const voteSummary = computeVoteSummary(argument.votes);

	return json({ vote_summary: voteSummary, user_id, weight: w }, { status: 200 });
};
