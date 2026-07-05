// /my/updates data source — aggregates 4 kinds of reactions on a user's content:
// 1. Forks of the user's arguments
// 2. New arguments on theses the user authored
// 3. Votes on the user's arguments
// 4. Votes on the user's theses
//
// Self-actions (user reacting to their own content) are filtered out.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getThesesByAuthor,
	getArgumentsByAuthor,
	getArgumentsForThesis,
	getForksOf,
	getThesisById
} from '$lib/stores/data';

type UpdateKind = 'fork' | 'new_argument' | 'vote_on_argument' | 'vote_on_thesis';

interface UpdateEvent {
	kind: UpdateKind;
	at: string;
	thesis_id: string;
	thesis_title: string;
	// fork
	original_argument_id?: string;
	original_content?: string;
	fork_argument_id?: string;
	fork_content?: string;
	// new_argument
	argument_id?: string;
	argument_stance?: 'support' | 'reject';
	argument_content?: string;
	// vote_*
	vote_type?: 'support' | 'reject' | 'neutral';
	vote_weight?: number;
	target_argument_id?: string;
	target_argument_content?: string;
}

interface UpdatesBody {
	user_id: string;
	generated_at: string;
	events: UpdateEvent[];
	counts: {
		forks: number;
		new_arguments: number;
		votes_on_arguments: number;
		votes_on_theses: number;
		total: number;
	};
}

function snip(s: string, n = 140): string {
	return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function aggregate(user_id: string): UpdatesBody {
	const myTheses = getThesesByAuthor(user_id);
	const myArgs = getArgumentsByAuthor(user_id);
	const events: UpdateEvent[] = [];

	// 1. Forks of my arguments
	for (const a of myArgs) {
		for (const fork of getForksOf(a.id)) {
			if (fork.meta.author_id === user_id) continue;
			const parent = getThesisById(fork.thesis_id);
			events.push({
				kind: 'fork',
				at: fork.meta.created_at,
				thesis_id: fork.thesis_id,
				thesis_title: parent?.title ?? '(unbekannt)',
				original_argument_id: a.id,
				original_content: snip(a.content),
				fork_argument_id: fork.id,
				fork_content: snip(fork.content)
			});
		}
	}

	// 2. New arguments on my theses
	for (const t of myTheses) {
		for (const a of getArgumentsForThesis(t.id)) {
			if (a.meta.author_id === user_id) continue;
			events.push({
				kind: 'new_argument',
				at: a.meta.created_at,
				thesis_id: t.id,
				thesis_title: t.title,
				argument_id: a.id,
				argument_stance: a.stance,
				argument_content: snip(a.content)
			});
		}
	}

	// 3. Votes on my arguments
	for (const a of myArgs) {
		const parent = getThesisById(a.thesis_id);
		for (const v of a.votes) {
			if (v.user_id === user_id) continue;
			events.push({
				kind: 'vote_on_argument',
				at: v.cast_at,
				thesis_id: a.thesis_id,
				thesis_title: parent?.title ?? '(unbekannt)',
				vote_type: v.type,
				vote_weight: v.weight ?? 1,
				target_argument_id: a.id,
				target_argument_content: snip(a.content)
			});
		}
	}

	// 4. Votes on my theses
	for (const t of myTheses) {
		for (const v of t.votes) {
			if (v.user_id === user_id) continue;
			events.push({
				kind: 'vote_on_thesis',
				at: v.cast_at,
				thesis_id: t.id,
				thesis_title: t.title,
				vote_type: v.type,
				vote_weight: v.weight ?? 1
			});
		}
	}

	events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

	let forks = 0, new_arguments = 0, votes_on_arguments = 0, votes_on_theses = 0;
	for (const e of events) {
		if (e.kind === 'fork') forks++;
		else if (e.kind === 'new_argument') new_arguments++;
		else if (e.kind === 'vote_on_argument') votes_on_arguments++;
		else if (e.kind === 'vote_on_thesis') votes_on_theses++;
	}

	return {
		user_id,
		generated_at: new Date().toISOString(),
		events,
		counts: {
			forks,
			new_arguments,
			votes_on_arguments,
			votes_on_theses,
			total: events.length
		}
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	return json(aggregate(locals.user_id));
};
