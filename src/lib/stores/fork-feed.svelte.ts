// Fork-Feed: tracks arguments the user voted on that have been forked.
// The user is prompted to choose: stay with the original or switch to the fork.

import type { Argument } from '$lib/models/types';
import { getVotedArgs } from './user';

const DECISIONS_KEY = 'quappe_fork_decisions';

export interface ForkDecision {
	original_id: string;
	fork_id: string;
	thesis_id: string;
	thesis_title: string;
	original_content: string;
	fork_content: string;
}

function loadDecisions(): Set<string> {
	if (typeof window === 'undefined') return new Set();
	try {
		const raw = localStorage.getItem(DECISIONS_KEY);
		return new Set(raw ? JSON.parse(raw) : []);
	} catch {
		return new Set();
	}
}

function saveDecision(key: string): void {
	if (typeof window === 'undefined') return;
	const set = loadDecisions();
	set.add(key);
	localStorage.setItem(DECISIONS_KEY, JSON.stringify([...set]));
}

function decisionKey(originalId: string, forkId: string): string {
	return `${originalId}::${forkId}`;
}

class ForkFeedStore {
	pending = $state<ForkDecision[]>([]);

	update(args: Argument[], thesisTitle: string): void {
		if (typeof window === 'undefined') return;

		const votedArgs = getVotedArgs();
		const decided = loadDecisions();

		// Build a lookup: argId → Argument
		const byId = new Map<string, Argument>(args.map((a) => [a.id, a]));

		const newPending: ForkDecision[] = [];
		for (const arg of args) {
			if (!arg.forked_from_id) continue;
			const original = byId.get(arg.forked_from_id);
			if (!original) continue;
			// Only surface if user voted on the original
			if (!votedArgs.has(original.id)) continue;
			// Only surface if not yet decided
			const key = decisionKey(original.id, arg.id);
			if (decided.has(key)) continue;

			newPending.push({
				original_id: original.id,
				fork_id: arg.id,
				thesis_id: arg.thesis_id,
				thesis_title: thesisTitle,
				original_content: original.content,
				fork_content: arg.content
			});
		}

		// Merge with existing pending (other theses may have added entries)
		const existingKeys = new Set(this.pending.map((d) => decisionKey(d.original_id, d.fork_id)));
		for (const d of newPending) {
			const key = decisionKey(d.original_id, d.fork_id);
			if (!existingKeys.has(key)) {
				this.pending = [...this.pending, d];
				existingKeys.add(key);
			}
		}
	}

	resolve(originalId: string, forkId: string): void {
		saveDecision(decisionKey(originalId, forkId));
		this.pending = this.pending.filter(
			(d) => !(d.original_id === originalId && d.fork_id === forkId)
		);
	}
}

export const forkFeedStore = new ForkFeedStore();
