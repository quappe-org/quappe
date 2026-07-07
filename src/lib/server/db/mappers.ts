import type { Argument, Thesis, Vote } from '../../models/types.ts';

// ---- Row shapes (what the SQL rows look like) ----

export interface ThesisRow {
	id: string;
	title: string;
	description: string;
	categories_json: string;
	hashtags_json: string;
	related_ids_json: string;
	archived: number;
	lifecycle_state: string;
	lifecycle_since: string;
	lifecycle_quality: number;
	lang: string | null;
	created_at: string;
	updated_at: string;
	author_id: string;
	location: string | null;
}

export interface ArgumentRow {
	id: string;
	thesis_id: string;
	stance: string;
	content: string;
	attributes_json: string;
	categories_json: string | null;
	hashtags_json: string | null;
	forked_from_id: string | null;
	created_at: string;
	updated_at: string;
	author_id: string;
	location: string | null;
}

export interface VoteRow {
	target_type: string;
	target_id: string;
	user_id: string;
	vote_type: string;
	weight: number;
	cast_at: string;
}

// ---- Row → domain ----

export function rowToVote(row: VoteRow): Vote {
	return {
		user_id: row.user_id,
		type: row.vote_type as Vote['type'],
		weight: row.weight,
		cast_at: row.cast_at
	};
}

export function rowToThesis(row: ThesisRow, votes: Vote[]): Thesis {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		categories: JSON.parse(row.categories_json),
		hashtags: row.hashtags_json ? JSON.parse(row.hashtags_json) : [],
		votes,
		related_thesis_ids: JSON.parse(row.related_ids_json),
		archived: row.archived === 1,
		lifecycle: {
			state: row.lifecycle_state as Thesis['lifecycle']['state'],
			state_since: row.lifecycle_since,
			quality_score: row.lifecycle_quality
		},
		lang: row.lang ?? undefined,
		meta: {
			created_at: row.created_at,
			updated_at: row.updated_at,
			author_id: row.author_id,
			location: row.location ?? undefined
		}
	};
}

export function rowToArgument(row: ArgumentRow, votes: Vote[]): Argument {
	return {
		id: row.id,
		thesis_id: row.thesis_id,
		stance: row.stance as Argument['stance'],
		content: row.content,
		attributes: JSON.parse(row.attributes_json),
		votes,
		forked_from_id: row.forked_from_id ?? undefined,
		categories: row.categories_json ? JSON.parse(row.categories_json) : undefined,
		hashtags: row.hashtags_json ? JSON.parse(row.hashtags_json) : undefined,
		meta: {
			created_at: row.created_at,
			updated_at: row.updated_at,
			author_id: row.author_id,
			location: row.location ?? undefined
		}
	};
}

// ---- Domain → row insert params ----

export function thesisInsertParams(t: Thesis): ThesisRow {
	return {
		id: t.id,
		title: t.title,
		description: t.description,
		categories_json: JSON.stringify(t.categories),
		hashtags_json: JSON.stringify(t.hashtags ?? []),
		related_ids_json: JSON.stringify(t.related_thesis_ids),
		archived: t.archived ? 1 : 0,
		lifecycle_state: t.lifecycle.state,
		lifecycle_since: t.lifecycle.state_since,
		lifecycle_quality: t.lifecycle.quality_score,
		lang: t.lang ?? null,
		created_at: t.meta.created_at,
		updated_at: t.meta.updated_at,
		author_id: t.meta.author_id,
		location: t.meta.location ?? null
	};
}

export function argumentInsertParams(a: Argument): ArgumentRow {
	return {
		id: a.id,
		thesis_id: a.thesis_id,
		stance: a.stance,
		content: a.content,
		attributes_json: JSON.stringify(a.attributes),
		categories_json: a.categories ? JSON.stringify(a.categories) : null,
		hashtags_json: a.hashtags ? JSON.stringify(a.hashtags) : null,
		forked_from_id: a.forked_from_id ?? null,
		created_at: a.meta.created_at,
		updated_at: a.meta.updated_at,
		author_id: a.meta.author_id,
		location: a.meta.location ?? null
	};
}

// ---- Float32Array ↔ Buffer ----

export function float32ToBuffer(fa: Float32Array): Buffer {
	return Buffer.from(fa.buffer, fa.byteOffset, fa.byteLength);
}

export function bufferToFloat32(buf: Buffer): Float32Array {
	const copy = new ArrayBuffer(buf.byteLength);
	new Uint8Array(copy).set(buf);
	return new Float32Array(copy);
}
