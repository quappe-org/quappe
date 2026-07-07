import type { Argument } from '../../models/types.ts';
import { prepare } from './index.ts';
import { argumentInsertParams, rowToArgument, type ArgumentRow } from './mappers.ts';
import { dbGetVotesForTarget, dbGetVotesForTargets, dbDeleteVotesForTarget } from './votes.ts';

function assembleArgs(rows: ArgumentRow[]): Argument[] {
	if (rows.length === 0) return [];
	const votesByArg = dbGetVotesForTargets(
		'argument',
		rows.map((r) => r.id)
	);
	return rows.map((r) => rowToArgument(r, votesByArg.get(r.id) ?? []));
}

export function dbGetArgumentById(id: string): Argument | undefined {
	const row = prepare<ArgumentRow>(`SELECT * FROM arguments WHERE id = ?`).get(id) as
		| ArgumentRow
		| undefined;
	if (!row) return undefined;
	const votes = dbGetVotesForTarget('argument', id);
	return rowToArgument(row, votes);
}

export function dbGetArgumentsForThesis(thesis_id: string): Argument[] {
	const rows = prepare<ArgumentRow>(`SELECT * FROM arguments WHERE thesis_id = ?`).all(
		thesis_id
	) as ArgumentRow[];
	return assembleArgs(rows);
}

export function dbGetAllArguments(): Argument[] {
	const rows = prepare<ArgumentRow>(`SELECT * FROM arguments`).all() as ArgumentRow[];
	return assembleArgs(rows);
}

export function dbGetForksOf(argument_id: string): Argument[] {
	const rows = prepare<ArgumentRow>(`SELECT * FROM arguments WHERE forked_from_id = ?`).all(
		argument_id
	) as ArgumentRow[];
	return assembleArgs(rows);
}

export function dbGetArgumentsByAuthor(user_id: string): Argument[] {
	const rows = prepare<ArgumentRow>(`SELECT * FROM arguments WHERE author_id = ?`).all(
		user_id
	) as ArgumentRow[];
	return assembleArgs(rows);
}

export function dbGetArgumentIdsForThesis(thesis_id: string): string[] {
	const rows = prepare<{ id: string }>(`SELECT id FROM arguments WHERE thesis_id = ?`).all(
		thesis_id
	) as { id: string }[];
	return rows.map((r) => r.id);
}

export function dbCountArgumentsPerHotThesis(): Map<string, number> {
	const rows = prepare<{ thesis_id: string; n: number }>(
		`SELECT a.thesis_id, COUNT(*) AS n
		 FROM arguments a
		 JOIN theses t ON t.id = a.thesis_id
		 WHERE t.lifecycle_state IN ('seedling','discussed','contested','crystallized')
		 GROUP BY a.thesis_id`
	).all() as { thesis_id: string; n: number }[];
	const out = new Map<string, number>();
	for (const r of rows) out.set(r.thesis_id, r.n);
	return out;
}

export function dbInsertArgument(a: Argument): void {
	prepare(
		`INSERT INTO arguments
		   (id, thesis_id, stance, content, attributes_json, categories_json, forked_from_id,
		    created_at, updated_at, author_id, location)
		 VALUES
		   (@id, @thesis_id, @stance, @content, @attributes_json, @categories_json, @forked_from_id,
		    @created_at, @updated_at, @author_id, @location)`
	).run(argumentInsertParams(a));
}

export function dbUpdateArgumentFields(
	id: string,
	fields: {
		content?: string;
		attributes?: Argument['attributes'];
		updated_at: string;
	}
): void {
	const sets: string[] = ['updated_at = @updated_at'];
	const params: Record<string, unknown> = { id, updated_at: fields.updated_at };
	if (fields.content !== undefined) {
		sets.push('content = @content');
		params.content = fields.content;
	}
	if (fields.attributes !== undefined) {
		sets.push('attributes_json = @attributes_json');
		params.attributes_json = JSON.stringify(fields.attributes);
	}
	prepare(`UPDATE arguments SET ${sets.join(', ')} WHERE id = @id`).run(params);
}

export function dbSetArgumentCategories(id: string, categories: string[]): boolean {
	// Machine annotation — does NOT touch updated_at (matches previous semantics).
	const info = prepare(`UPDATE arguments SET categories_json = ? WHERE id = ?`).run(
		JSON.stringify(categories),
		id
	);
	return info.changes > 0;
}

export function dbDeleteArgument(id: string): boolean {
	dbDeleteVotesForTarget('argument', id);
	const info = prepare(`DELETE FROM arguments WHERE id = ?`).run(id);
	return info.changes > 0;
}

// Bulk seed helper — caller wraps in withTransaction.
export function dbInsertArgumentsBulk(args: Argument[]): void {
	const stmt = prepare(
		`INSERT INTO arguments
		   (id, thesis_id, stance, content, attributes_json, categories_json, forked_from_id,
		    created_at, updated_at, author_id, location)
		 VALUES
		   (@id, @thesis_id, @stance, @content, @attributes_json, @categories_json, @forked_from_id,
		    @created_at, @updated_at, @author_id, @location)`
	);
	for (const a of args) stmt.run(argumentInsertParams(a));
}
