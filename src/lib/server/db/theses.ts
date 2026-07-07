import type { Thesis } from '../../models/types.ts';
import { prepare } from './index.ts';
import { rowToThesis, thesisInsertParams, type ThesisRow } from './mappers.ts';
import { dbGetVotesForTarget, dbGetVotesForTargets, dbDeleteVotesForTarget } from './votes.ts';

const HOT_STATES = new Set(['seedling', 'discussed', 'contested', 'crystallized']);

export function dbGetThesisById(id: string): Thesis | undefined {
	const row = prepare<ThesisRow>(`SELECT * FROM theses WHERE id = ?`).get(id) as
		| ThesisRow
		| undefined;
	if (!row) return undefined;
	const votes = dbGetVotesForTarget('thesis', id);
	return rowToThesis(row, votes);
}

// Assemble many theses in two queries: one for the rows, one bulk vote fetch.
function assembleTheses(rows: ThesisRow[]): Thesis[] {
	if (rows.length === 0) return [];
	const votesByThesis = dbGetVotesForTargets(
		'thesis',
		rows.map((r) => r.id)
	);
	return rows.map((r) => rowToThesis(r, votesByThesis.get(r.id) ?? []));
}

export function dbGetAllTheses(): Thesis[] {
	const rows = prepare<ThesisRow>(`SELECT * FROM theses`).all() as ThesisRow[];
	return assembleTheses(rows);
}

export function dbGetHotTheses(): Thesis[] {
	const rows = prepare<ThesisRow>(
		`SELECT * FROM theses WHERE lifecycle_state IN ('seedling','discussed','contested','crystallized')`
	).all() as ThesisRow[];
	return assembleTheses(rows);
}

export function dbGetThesesByAuthor(user_id: string): Thesis[] {
	const rows = prepare<ThesisRow>(`SELECT * FROM theses WHERE author_id = ?`).all(
		user_id
	) as ThesisRow[];
	return assembleTheses(rows);
}

export function dbGetThesesMissingLang(): Thesis[] {
	const rows = prepare<ThesisRow>(`SELECT * FROM theses WHERE lang IS NULL`).all() as ThesisRow[];
	return assembleTheses(rows);
}

export function dbTierStats(): { hot: number; warm: number; cold: number; total: number } {
	const rows = prepare<{ lifecycle_state: string; n: number }>(
		`SELECT lifecycle_state, COUNT(*) AS n FROM theses GROUP BY lifecycle_state`
	).all() as { lifecycle_state: string; n: number }[];
	let hot = 0;
	let warm = 0;
	let cold = 0;
	for (const r of rows) {
		if (r.lifecycle_state === 'dormant') cold += r.n;
		else if (r.lifecycle_state === 'faded') warm += r.n;
		else if (HOT_STATES.has(r.lifecycle_state)) hot += r.n;
	}
	return { hot, warm, cold, total: hot + warm + cold };
}

export function dbInsertThesis(t: Thesis): void {
	const p = thesisInsertParams(t);
	prepare(
		`INSERT INTO theses
		   (id, title, description, categories_json, related_ids_json, archived,
		    lifecycle_state, lifecycle_since, lifecycle_quality, lang,
		    created_at, updated_at, author_id, location)
		 VALUES
		   (@id, @title, @description, @categories_json, @related_ids_json, @archived,
		    @lifecycle_state, @lifecycle_since, @lifecycle_quality, @lang,
		    @created_at, @updated_at, @author_id, @location)`
	).run(p);
}

export function dbUpdateThesisFields(
	id: string,
	fields: {
		title?: string;
		description?: string;
		categories?: string[];
		archived?: boolean;
		lang?: string | null;
		updated_at: string;
	}
): void {
	const sets: string[] = ['updated_at = @updated_at'];
	const params: Record<string, unknown> = { id, updated_at: fields.updated_at };
	if (fields.title !== undefined) {
		sets.push('title = @title');
		params.title = fields.title;
	}
	if (fields.description !== undefined) {
		sets.push('description = @description');
		params.description = fields.description;
	}
	if (fields.categories !== undefined) {
		sets.push('categories_json = @categories_json');
		params.categories_json = JSON.stringify(fields.categories);
	}
	if (fields.archived !== undefined) {
		sets.push('archived = @archived');
		params.archived = fields.archived ? 1 : 0;
	}
	if (fields.lang !== undefined) {
		sets.push('lang = @lang');
		params.lang = fields.lang;
	}
	prepare(`UPDATE theses SET ${sets.join(', ')} WHERE id = @id`).run(params);
}

export function dbUpdateThesisLifecycle(
	id: string,
	state: string,
	state_since: string,
	quality_score: number
): void {
	prepare(
		`UPDATE theses SET lifecycle_state = ?, lifecycle_since = ?, lifecycle_quality = ? WHERE id = ?`
	).run(state, state_since, quality_score, id);
}

export function dbSetThesisRelated(id: string, related_ids: string[]): void {
	prepare(`UPDATE theses SET related_ids_json = ? WHERE id = ?`).run(
		JSON.stringify(related_ids),
		id
	);
}

export function dbDeleteThesis(id: string): boolean {
	// Cascade for arguments is ON DELETE CASCADE; votes need explicit cleanup
	// (thesis-level votes + argument-level votes for arguments of this thesis).
	const argIds = prepare<{ id: string }>(`SELECT id FROM arguments WHERE thesis_id = ?`).all(
		id
	) as { id: string }[];
	dbDeleteVotesForTarget('thesis', id);
	for (const a of argIds) dbDeleteVotesForTarget('argument', a.id);
	const info = prepare(`DELETE FROM theses WHERE id = ?`).run(id);
	return info.changes > 0;
}

export function dbHasThesis(id: string): boolean {
	const row = prepare<{ id: string }>(`SELECT id FROM theses WHERE id = ? LIMIT 1`).get(id) as
		| { id: string }
		| undefined;
	return !!row;
}

// Bulk insert used by seed. Caller wraps in withTransaction.
export function dbInsertThesesBulk(theses: Thesis[]): void {
	const stmt = prepare(
		`INSERT INTO theses
		   (id, title, description, categories_json, related_ids_json, archived,
		    lifecycle_state, lifecycle_since, lifecycle_quality, lang,
		    created_at, updated_at, author_id, location)
		 VALUES
		   (@id, @title, @description, @categories_json, @related_ids_json, @archived,
		    @lifecycle_state, @lifecycle_since, @lifecycle_quality, @lang,
		    @created_at, @updated_at, @author_id, @location)`
	);
	for (const t of theses) stmt.run(thesisInsertParams(t));
}
