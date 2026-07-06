import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVotesByUserSince, getThesesByAuthor } from '$lib/stores/data';

const VOTE_LIMIT = 62;
const THESIS_LIMIT = 7;

interface BudgetEvent {
	kind: 'vote' | 'thesis';
	at: string;
	thesis_id: string;
	thesis_title: string;
	vote_type?: string;
	weight?: number;
	target?: 'thesis' | 'argument';
}

interface BudgetToday {
	date: string;
	votes_spent: number;
	votes_limit: number;
	votes_remaining: number;
	theses_created: number;
	theses_limit: number;
	theses_remaining: number;
	events: BudgetEvent[];
}

function todayStart(): { dateOnly: string; iso: string } {
	const now = new Date();
	const dateOnly = now.toISOString().split('T')[0];
	return { dateOnly, iso: `${dateOnly}T00:00:00.000Z` };
}

function aggregateToday(user_id: string): BudgetToday {
	const { dateOnly, iso: sinceIso } = todayStart();

	// Each support/reject cast costs 1 point regardless of weight; each extra weight point costs 1 more.
	// Neutral is free.
	const votes = getVotesByUserSince(user_id, sinceIso).filter(
		(v) => v.vote_type === 'support' || v.vote_type === 'reject'
	);

	let votes_spent = 0;
	const events: BudgetEvent[] = [];
	for (const v of votes) {
		votes_spent += 1 + Math.max(0, v.weight - 1);
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

	// Theses created today by this user.
	const authored = getThesesByAuthor(user_id).filter((t) => t.meta.created_at >= sinceIso);
	for (const t of authored) {
		events.push({
			kind: 'thesis',
			at: t.meta.created_at,
			thesis_id: t.id,
			thesis_title: t.title
		});
	}

	events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

	return {
		date: dateOnly,
		votes_spent,
		votes_limit: VOTE_LIMIT,
		votes_remaining: Math.max(0, VOTE_LIMIT - votes_spent),
		theses_created: authored.length,
		theses_limit: THESIS_LIMIT,
		theses_remaining: Math.max(0, THESIS_LIMIT - authored.length),
		events
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	return json(aggregateToday(locals.user_id));
};
