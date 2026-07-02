// Pure lifecycle transition engine.
// Given a snapshot of a thesis + its arguments, computes the current
// lifecycle state and quality score. Deterministic - no I/O, no random.

import type { Argument, LifecycleState, Thesis } from './types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

// ---- Tunable thresholds (single source of truth) ----
export const LIFECYCLE_THRESHOLDS = {
	seedlingMaxDays: 7,
	seedlingMinVotes: 3, // fewer than this after 14d => faded
	discussedMinVotes: 5, // needed to move past seedling
	crystallizedMinVotes: 20, // needed for consensus recognition
	crystallizedMinArgs: 3, // minimum argument count for crystallisation
	crystallizedConsensus: 0.65, // support/(support+reject) >= this
	contestedSplitBand: 0.2, // |support-reject| / (support+reject) <= this
	fadedInactivityDays: 30, // no interaction since => faded candidate
	dormantInactivityDays: 90 // longer inactivity => cold storage
} as const;

export interface ActivitySnapshot {
	created_at: number; // ms epoch
	last_activity_at: number; // ms epoch of most recent vote or argument creation
	total_votes: number;
	support_votes: number;
	reject_votes: number;
	neutral_votes: number;
	unique_voters: number;
	arg_count: number;
	arg_with_evidence: number; // args with study/authority/experiential (not just emotional/logical)
}

/** Compute activity snapshot from a thesis + its arguments. O(V + A + AV). */
export function buildActivitySnapshot(thesis: Thesis, args: Argument[], nowMs: number): ActivitySnapshot {
	const created = Date.parse(thesis.meta.created_at);
	let lastActivity = created;
	let support = 0;
	let reject = 0;
	let neutral = 0;
	const voters = new Set<string>();

	for (const v of thesis.votes) {
		const t = Date.parse(v.cast_at);
		if (t > lastActivity) lastActivity = t;
		voters.add(v.user_id);
		const w = v.weight || 1;
		if (v.type === 'support') support += w;
		else if (v.type === 'reject') reject += w;
		else neutral += w;
	}

	let argWithEvidence = 0;
	for (const arg of args) {
		const t = Date.parse(arg.meta.created_at);
		if (t > lastActivity) lastActivity = t;
		voters.add(arg.meta.author_id);
		const hasStrongEvidence = arg.attributes.some(
			(a) => a.evidence_type === 'study' || a.evidence_type === 'authority'
		);
		if (hasStrongEvidence) argWithEvidence++;
		for (const v of arg.votes) {
			const vt = Date.parse(v.cast_at);
			if (vt > lastActivity) lastActivity = vt;
			voters.add(v.user_id);
		}
	}

	return {
		created_at: created,
		last_activity_at: lastActivity,
		total_votes: support + reject + neutral,
		support_votes: support,
		reject_votes: reject,
		neutral_votes: neutral,
		unique_voters: voters.size,
		arg_count: args.length,
		arg_with_evidence: argWithEvidence
	};
}

/** Deterministic state derivation from a snapshot. */
export function deriveLifecycleState(snap: ActivitySnapshot, nowMs: number): LifecycleState {
	const t = LIFECYCLE_THRESHOLDS;
	const ageDays = (nowMs - snap.created_at) / DAY_MS;
	const inactivityDays = (nowMs - snap.last_activity_at) / DAY_MS;

	// Dormant beats everything - if truly inactive, it's cold
	if (inactivityDays >= t.dormantInactivityDays) return 'dormant';

	// Very young: seedling stage
	if (ageDays < t.seedlingMaxDays && snap.total_votes < t.discussedMinVotes) {
		return 'seedling';
	}

	// Seedling that didn't grow -> faded
	if (ageDays >= t.seedlingMaxDays * 2 && snap.total_votes < t.seedlingMinVotes) {
		return 'faded';
	}

	// Long inactivity but some history -> faded
	if (inactivityDays >= t.fadedInactivityDays) return 'faded';

	// Enough votes to evaluate consensus?
	if (snap.total_votes >= t.crystallizedMinVotes) {
		const decisiveTotal = snap.support_votes + snap.reject_votes;
		if (decisiveTotal > 0) {
			const supportRatio = snap.support_votes / decisiveTotal;
			const consensus = Math.max(supportRatio, 1 - supportRatio);

			// Crystallised: strong side + minimum arguments
			if (consensus >= t.crystallizedConsensus && snap.arg_count >= t.crystallizedMinArgs) {
				return 'crystallized';
			}

			// Roughly balanced -> contested
			const split = Math.abs(snap.support_votes - snap.reject_votes) / decisiveTotal;
			if (split <= t.contestedSplitBand) return 'contested';
		}
	}

	// Default for "alive but nothing decided yet"
	return 'discussed';
}

/** Quality score in [0..1]. Composite; see .project skill. */
export function computeQualityScore(snap: ActivitySnapshot): number {
	// consensus_strength: 0 (perfectly split) .. 1 (unanimous)
	const decisiveTotal = snap.support_votes + snap.reject_votes;
	const supportRatio = decisiveTotal > 0 ? snap.support_votes / decisiveTotal : 0.5;
	const consensus = Math.abs(supportRatio - 0.5) * 2;

	// argument_depth: normalised to 7 as "saturated" argument pool
	const argDepth = Math.min(1, snap.arg_count / 7);

	// peer_engagement: normalised to 20 unique voters
	const engagement = Math.min(1, snap.unique_voters / 20);

	// evidence_density: fraction of args with strong evidence
	const evidence = snap.arg_count > 0 ? snap.arg_with_evidence / snap.arg_count : 0;

	const score = 0.4 * consensus + 0.3 * argDepth + 0.2 * engagement + 0.1 * evidence;
	return Math.max(0, Math.min(1, score));
}

/** All-in-one: given thesis + args + now, compute the lifecycle info. */
export function computeLifecycle(
	thesis: Thesis,
	args: Argument[],
	nowMs: number = Date.now()
): { state: LifecycleState; quality_score: number; snapshot: ActivitySnapshot } {
	const snapshot = buildActivitySnapshot(thesis, args, nowMs);
	const state = deriveLifecycleState(snapshot, nowMs);
	const quality_score = computeQualityScore(snapshot);
	return { state, quality_score, snapshot };
}
