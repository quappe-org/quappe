import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { voteOnArgument, computeVoteSummary } from '$lib/stores/data';
import { checkRate, getClientIp } from '$lib/server/limits';

export const POST: RequestHandler = async ({ params, request, getClientAddress, locals }) => {
	const body = await request.json();
	const { type, weight } = body;
	const user_id = locals.user_id;

	const ip = getClientIp(request, getClientAddress());
	const rate = checkRate(ip, user_id, 'write_light');
	if (rate) return rate;

	if (!type || !['support', 'reject', 'neutral'].includes(type)) {
		return json({ error: 'Invalid vote type. Must be support, reject, or neutral.' }, { status: 400 });
	}

	const w = typeof weight === 'number' ? Math.max(1, Math.min(5, Math.floor(weight))) : 1;
	const argument = voteOnArgument(params.id, user_id, type, w);

	if (!argument) {
		return json({ error: 'Argument not found' }, { status: 404 });
	}

	const voteSummary = computeVoteSummary(argument.votes);

	return json({ vote_summary: voteSummary, user_id, weight: w }, { status: 200 });
};
