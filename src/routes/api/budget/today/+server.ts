import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVotesByUserSince, getThesisById } from '$lib/stores/data';

const DAILY_LIMIT = 62;

interface BudgetEvent {
	kind: 'weight_vote';
	at: string;
	thesis_id: string;
	thesis_title: string;
	vote_type: string;
	extra_weight: number;
	target: 'thesis' | 'argument';
}

interface BudgetToday {
	date: string;
	spent: number;
	limit: number;
	remaining: number;
	events: BudgetEvent[];
}

function todayStart(): { dateOnly: string; iso: string } {
	const now = new Date();
	const dateOnly = now.toISOString().split('T')[0];
	return { dateOnly, iso: `${dateOnly}T00:00:00.000Z` };
}

function aggregateToday(user_id: string): BudgetToday {
	const { dateOnly, iso: sinceIso } = todayStart();
	const weightedVotes = getVotesByUserSince(user_id, sinceIso).filter((v) => v.weight > 1);

	let spent = 0;
	const events: BudgetEvent[] = [];
	for (const v of weightedVotes) {
		const extra = v.weight - 1;
		spent += extra;
		events.push({
			kind: 'weight_vote',
			at: v.cast_at,
			thesis_id: v.thesis_id,
			thesis_title: v.thesis_title,
			vote_type: v.vote_type,
			extra_weight: extra,
			target: v.target
		});
	}

	events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

	return {
		date: dateOnly,
		spent,
		limit: DAILY_LIMIT,
		remaining: Math.max(0, DAILY_LIMIT - spent),
		events
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	return json(aggregateToday(locals.user_id));
};
