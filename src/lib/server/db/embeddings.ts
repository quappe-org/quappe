import { prepare } from './index.ts';
import { bufferToFloat32, float32ToBuffer } from './mappers.ts';

export type EmbeddingTarget = 'thesis' | 'argument';

interface EmbeddingRow {
	target_id: string;
	vec: Buffer;
}

export function dbGetAllEmbeddings(target_type: EmbeddingTarget): Map<string, Float32Array> {
	const rows = prepare<EmbeddingRow>(
		`SELECT target_id, vec FROM embeddings WHERE target_type = ?`
	).all(target_type) as EmbeddingRow[];
	const out = new Map<string, Float32Array>();
	for (const r of rows) out.set(r.target_id, bufferToFloat32(r.vec));
	return out;
}

export function dbUpsertEmbedding(
	target_type: EmbeddingTarget,
	target_id: string,
	vec: Float32Array
): void {
	prepare(
		`INSERT INTO embeddings (target_type, target_id, vec, dim, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(target_type, target_id) DO UPDATE SET
		   vec        = excluded.vec,
		   dim        = excluded.dim,
		   updated_at = excluded.updated_at`
	).run(target_type, target_id, float32ToBuffer(vec), vec.length, new Date().toISOString());
}

export function dbDeleteEmbedding(target_type: EmbeddingTarget, target_id: string): void {
	prepare(`DELETE FROM embeddings WHERE target_type = ? AND target_id = ?`).run(
		target_type,
		target_id
	);
}
