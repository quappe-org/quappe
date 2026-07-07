import type { Vote } from '../../models/types.ts';
import { prepare } from './index.ts';
import { rowToVote, type VoteRow } from './mappers.ts';

export type VoteTarget = 'thesis' | 'argument';

export function dbGetVotesForTarget(target_type: VoteTarget, target_id: string): Vote[] {
	const rows = prepare<VoteRow>(
		`SELECT target_type, target_id, user_id, vote_type, weight, cast_at
		 FROM votes WHERE target_type = ? AND target_id = ?`
	).all(target_type, target_id) as VoteRow[];
	return rows.map(rowToVote);
}

// Bulk fetch: one SELECT for a set of target_ids. Returns Map<target_id, Vote[]>.
export function dbGetVotesForTargets(
	target_type: VoteTarget,
	target_ids: string[]
): Map<string, Vote[]> {
	const out = new Map<string, Vote[]>();
	if (target_ids.length === 0) return out;
	for (const id of target_ids) out.set(id, []);
	// One query with an IN-list. Chunk if we ever exceed SQLite's 999-parameter limit.
	const CHUNK = 500;
	for (let i = 0; i < target_ids.length; i += CHUNK) {
		const chunk = target_ids.slice(i, i + CHUNK);
		const placeholders = chunk.map(() => '?').join(',');
		const rows = prepare<VoteRow>(
			`SELECT target_type, target_id, user_id, vote_type, weight, cast_at
			 FROM votes WHERE target_type = ? AND target_id IN (${placeholders})`
		).all(target_type, ...chunk) as VoteRow[];
		for (const r of rows) {
			const list = out.get(r.target_id);
			if (list) list.push(rowToVote(r));
		}
	}
	return out;
}

export function dbUpsertVote(
	target_type: VoteTarget,
	target_id: string,
	user_id: string,
	vote_type: Vote['type'],
	weight: number,
	cast_at: string
): void {
	prepare(
		`INSERT INTO votes (target_type, target_id, user_id, vote_type, weight, cast_at)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(target_type, target_id, user_id) DO UPDATE SET
		   vote_type = excluded.vote_type,
		   weight    = excluded.weight,
		   cast_at   = excluded.cast_at`
	).run(target_type, target_id, user_id, vote_type, weight, cast_at);
}

export function dbDeleteVote(target_type: VoteTarget, target_id: string, user_id: string): void {
	prepare(`DELETE FROM votes WHERE target_type = ? AND target_id = ? AND user_id = ?`).run(
		target_type,
		target_id,
		user_id
	);
}

export function dbDeleteVotesForTarget(target_type: VoteTarget, target_id: string): void {
	prepare(`DELETE FROM votes WHERE target_type = ? AND target_id = ?`).run(target_type, target_id);
}

export function dbGetUserVoteOn(
	target_type: VoteTarget,
	target_id: string,
	user_id: string
): Vote | undefined {
	const row = prepare<VoteRow>(
		`SELECT target_type, target_id, user_id, vote_type, weight, cast_at
		 FROM votes WHERE target_type = ? AND target_id = ? AND user_id = ?`
	).get(target_type, target_id, user_id) as VoteRow | undefined;
	return row ? rowToVote(row) : undefined;
}

export interface UserVoteRow {
	target: VoteTarget;
	target_id: string;
	thesis_id: string;
	thesis_title: string;
	vote_type: string;
	weight: number;
	cast_at: string;
}

// All votes by a user since sinceIso, joined so we can return the parent thesis title
// for argument-votes without a second lookup per row.
export function dbGetVotesByUserSince(user_id: string, sinceIso: string): UserVoteRow[] {
	const rows = prepare<{
		target_type: string;
		target_id: string;
		vote_type: string;
		weight: number;
		cast_at: string;
		thesis_id: string | null;
		thesis_title: string | null;
	}>(
		`SELECT
		   v.target_type,
		   v.target_id,
		   v.vote_type,
		   v.weight,
		   v.cast_at,
		   CASE v.target_type
		     WHEN 'thesis' THEN v.target_id
		     ELSE a.thesis_id
		   END AS thesis_id,
		   CASE v.target_type
		     WHEN 'thesis' THEN t.title
		     ELSE pt.title
		   END AS thesis_title
		 FROM votes v
		 LEFT JOIN theses    t  ON v.target_type = 'thesis'   AND t.id  = v.target_id
		 LEFT JOIN arguments a  ON v.target_type = 'argument' AND a.id  = v.target_id
		 LEFT JOIN theses    pt ON v.target_type = 'argument' AND pt.id = a.thesis_id
		 WHERE v.user_id = ? AND v.cast_at >= ?
		 ORDER BY v.cast_at DESC`
	).all(user_id, sinceIso) as {
		target_type: string;
		target_id: string;
		vote_type: string;
		weight: number;
		cast_at: string;
		thesis_id: string | null;
		thesis_title: string | null;
	}[];
	return rows.map((r) => ({
		target: r.target_type as VoteTarget,
		target_id: r.target_id,
		thesis_id: r.thesis_id ?? '',
		thesis_title: r.thesis_title ?? '(unknown thesis)',
		vote_type: r.vote_type,
		weight: r.weight,
		cast_at: r.cast_at
	}));
}

// Distinct thesis_ids the user has ever voted on (thesis-level votes only).
export function dbGetThesisIdsVotedByUser(
	user_id: string
): { thesis_id: string; vote_type: string }[] {
	return prepare<{ thesis_id: string; vote_type: string }>(
		`SELECT target_id AS thesis_id, vote_type
		 FROM votes WHERE target_type = 'thesis' AND user_id = ?`
	).all(user_id) as { thesis_id: string; vote_type: string }[];
}
