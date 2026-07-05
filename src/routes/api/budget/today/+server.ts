import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getThesesByAuthor,
	getArgumentsByAuthor,
	getVotesByUserSince,
	getThesisById
} from '$lib/stores/data';

const DAILY_LIMIT = 7;

type EventKind = 'thesis' | 'argument' | 'weight_vote';

interface BudgetEvent {
	kind: EventKind;
	at: string;
	thesis_id: string;
	thesis_title: string;
	// argument-only
	stance?: 'support' | 'reject';
	content?: string;
	// thesis-only
	title?: string;
	// weight_vote-only
	vote_type?: string;
	extra_weight?: number;
	target?: 'thesis' | 'argument';
}

interface BudgetToday {
	date: string;
	spent: { thesis: number; support: number; reject: number };
	limit: number;
	remaining: { thesis: number; support: number; reject: number };
	events: BudgetEvent[];
}

function todayStart(): { dateOnly: string; iso: string } {
	const now = new Date();
	const dateOnly = now.toISOString().split('T')[0];
	return { dateOnly, iso: `${dateOnly}T00:00:00.000Z` };
}

function aggregateToday(user_id: string): BudgetToday {
	const { dateOnly, iso: sinceIso } = todayStart();
	const isToday = (ts: string) => ts >= sinceIso;

	const theses = getThesesByAuthor(user_id).filter((t) => isToday(t.meta.created_at));
	const args = getArgumentsByAuthor(user_id).filter((a) => isToday(a.meta.created_at));
	const weightedVotes = getVotesByUserSince(user_id, sinceIso).filter((v) => v.weight > 1);

	let supportSpent = 0;
	let rejectSpent = 0;
	for (const a of args) {
		if (a.stance === 'support') supportSpent++;
		else if (a.stance === 'reject') rejectSpent++;
	}
	for (const v of weightedVotes) {
		const extra = v.weight - 1;
		if (v.vote_type === 'support') supportSpent += extra;
		else if (v.vote_type === 'reject') rejectSpent += extra;
	}

	const spent = {
		thesis: theses.length,
		support: supportSpent,
		reject: rejectSpent
	};

	const events: BudgetEvent[] = [];
	for (const t of theses) {
		events.push({
			kind: 'thesis',
			at: t.meta.created_at,
			thesis_id: t.id,
			thesis_title: t.title,
			title: t.title
		});
	}
	for (const a of args) {
		const parent = getThesisById(a.thesis_id);
		events.push({
			kind: 'argument',
			at: a.meta.created_at,
			thesis_id: a.thesis_id,
			thesis_title: parent?.title ?? '(unknown thesis)',
			stance: a.stance,
			content: a.content.length > 160 ? a.content.slice(0, 157) + '…' : a.content
		});
	}
	for (const v of weightedVotes) {
		events.push({
			kind: 'weight_vote',
			at: v.cast_at,
			thesis_id: v.thesis_id,
			thesis_title: v.thesis_title,
			vote_type: v.vote_type,
			extra_weight: v.weight - 1,
			target: v.target
		});
	}

	events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

	return {
		date: dateOnly,
		spent,
		limit: DAILY_LIMIT,
		remaining: {
			thesis: Math.max(0, DAILY_LIMIT - spent.thesis),
			support: Math.max(0, DAILY_LIMIT - spent.support),
			reject: Math.max(0, DAILY_LIMIT - spent.reject)
		},
		events
	};
}

export const GET: RequestHandler = async ({ url }) => {
	const user_id = url.searchParams.get('user_id');
	if (!user_id) return json({ error: 'user_id required' }, { status: 400 });
	return json(aggregateToday(user_id));
};
