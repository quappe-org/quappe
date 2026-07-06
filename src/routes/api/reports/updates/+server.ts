// /my/updates data source — aggregates 3 kinds of notifications:
// 1. New counter-arguments on the user's theses
// 2. Forks of the user's arguments
// 3. Lifecycle transitions on theses the user supported (within last 14 days)
//
// Self-actions (user reacting to their own content) are filtered out.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getThesesByAuthor,
	getArgumentsByAuthor,
	getArgumentsForThesis,
	getForksOf,
	getThesisById,
	getAllTheses
} from '$lib/stores/data';

type UpdateKind = 'fork' | 'new_argument' | 'lifecycle';

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
	// lifecycle
	lifecycle_state?: string;
}

interface UpdatesBody {
	user_id: string;
	generated_at: string;
	events: UpdateEvent[];
	counts: {
		forks: number;
		new_arguments: number;
		lifecycle: number;
		total: number;
	};
}

function snip(s: string, n = 140): string {
	return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

const LIFECYCLE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

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
				thesis_title: parent?.title ?? '(unknown)',
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

	// 3. Lifecycle transitions on theses I supported (within the last 14 days).
	// One entry per thesis, dated at `state_since`. Skips theses I authored
	// (those are already covered by 1 and 2).
	const now = Date.now();
	for (const t of getAllTheses()) {
		if (t.meta.author_id === user_id) continue;
		const myVote = t.votes.find((v) => v.user_id === user_id && v.type === 'support');
		if (!myVote) continue;
		const stateSince = t.lifecycle.state_since;
		if (!stateSince) continue;
		const since = new Date(stateSince).getTime();
		if (!Number.isFinite(since)) continue;
		if (now - since > LIFECYCLE_WINDOW_MS) continue;
		events.push({
			kind: 'lifecycle',
			at: stateSince,
			thesis_id: t.id,
			thesis_title: t.title,
			lifecycle_state: t.lifecycle.state
		});
	}

	events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

	let forks = 0,
		new_arguments = 0,
		lifecycle = 0;
	for (const e of events) {
		if (e.kind === 'fork') forks++;
		else if (e.kind === 'new_argument') new_arguments++;
		else if (e.kind === 'lifecycle') lifecycle++;
	}

	return {
		user_id,
		generated_at: new Date().toISOString(),
		events,
		counts: {
			forks,
			new_arguments,
			lifecycle,
			total: events.length
		}
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	return json(aggregate(locals.user_id));
};
