import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVotesByUserSince, getThesesByAuthor, getArgumentsByAuthor } from '$lib/stores/data';
import { getBudgetStatus, todayStartIso } from '$lib/server/budget';

// Recent activity feed, decorated onto the authoritative budget status.
interface BudgetEvent {
	kind: 'vote' | 'thesis' | 'argument';
	at: string;
	thesis_id: string;
	thesis_title: string;
	vote_type?: string;
	weight?: number;
	target?: 'thesis' | 'argument';
	stance?: 'support' | 'reject';
}

export const GET: RequestHandler = async ({ locals }) => {
	const user_id = locals.user_id;
	const status = getBudgetStatus(user_id);
	const { iso: sinceIso } = todayStartIso();

	const events: BudgetEvent[] = [];

	// Votes cast today (base votes free; extra weight is what costs).
	for (const v of getVotesByUserSince(user_id, sinceIso)) {
		if (v.vote_type !== 'support' && v.vote_type !== 'reject') continue;
		events.push({
			kind: 'vote',
			at: v.cast_at,
			thesis_id: v.thesis_id,
			thesis_title: v.thesis_title,
			vote_type: v.vote_type,
			weight: v.weight,
			target: v.target
		});
	}

	// Theses created today.
	for (const t of getThesesByAuthor(user_id).filter((t) => t.meta.created_at >= sinceIso)) {
		events.push({ kind: 'thesis', at: t.meta.created_at, thesis_id: t.id, thesis_title: t.title });
	}

	// Arguments created today (support/reject buckets).
	for (const a of getArgumentsByAuthor(user_id).filter((a) => a.meta.created_at >= sinceIso)) {
		events.push({
			kind: 'argument',
			at: a.meta.created_at,
			thesis_id: a.thesis_id,
			thesis_title: '',
			stance: a.stance
		});
	}

	events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

	return json({ ...status, events });
};
