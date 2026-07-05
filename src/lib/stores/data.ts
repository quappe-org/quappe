// In-memory data store for MVP
// Will be replaced by a proper database in later phases

import type { Thesis, Argument, Vote, VoteSummary, Meta, LifecycleState } from '../models/types.ts';
import { computeLifecycle } from '../models/lifecycle.ts';
import { logger } from './logger.ts';

// ---- Storage tiers ----
// hot:  active theses (seedling / discussed / contested / crystallized) - fully loaded
// warm: faded theses - kept in memory but without recomputed lifecycle each request
// cold: dormant theses - only ID + title + categories + meta, votes/args pruned
//
// A thesis is stored in exactly one map. On mutation, it can be promoted / demoted.
const theses_hot: Map<string, Thesis> = new Map();
const theses_warm: Map<string, Thesis> = new Map();
const theses_cold: Map<string, Thesis> = new Map();

// Combined view: helper only, do NOT iterate this in hot paths - it recreates the array.
function findThesis(id: string): { thesis: Thesis; tier: 'hot' | 'warm' | 'cold' } | undefined {
	let t = theses_hot.get(id);
	if (t) return { thesis: t, tier: 'hot' };
	t = theses_warm.get(id);
	if (t) return { thesis: t, tier: 'warm' };
	t = theses_cold.get(id);
	if (t) return { thesis: t, tier: 'cold' };
	return undefined;
}

// Reverse index: thesis_id -> Set of argument_ids (for O(1) argument lookup by thesis)
const args_by_thesis: Map<string, Set<string>> = new Map();
const arguments_store: Map<string, Argument> = new Map();

// Embedding index: separate maps so Float32Arrays are never accidentally serialized to JSON
const thesis_embeddings: Map<string, Float32Array> = new Map();
const argument_embeddings: Map<string, Float32Array> = new Map();

export function hasThesisEmbedding(id: string): boolean {
	return thesis_embeddings.has(id);
}

export function setThesisEmbedding(id: string, vec: Float32Array): void {
	thesis_embeddings.set(id, vec);
}

export function setArgumentEmbedding(id: string, vec: Float32Array): void {
	argument_embeddings.set(id, vec);
}

export function getThesesWithEmbeddings(): { thesis: Thesis; embedding: Float32Array }[] {
	const result: { thesis: Thesis; embedding: Float32Array }[] = [];
	for (const [id, embedding] of thesis_embeddings) {
		const found = findThesis(id);
		if (found && !found.thesis.archived) result.push({ thesis: found.thesis, embedding });
	}
	return result;
}

export function getArgumentsWithEmbeddings(): { argument: Argument; embedding: Float32Array }[] {
	const result: { argument: Argument; embedding: Float32Array }[] = [];
	for (const [id, embedding] of argument_embeddings) {
		const arg = arguments_store.get(id);
		if (arg) result.push({ argument: arg, embedding });
	}
	return result;
}

// When true, lifecycle transitions won't log (used during bulk seed)
let suppressLifecycleLogs = false;

// Helper: generate UUID
function generateId(): string {
	return crypto.randomUUID();
}

// Helper: create meta
function createMeta(author_id: string, location?: string): Meta {
	const now = new Date().toISOString();
	return {
		created_at: now,
		updated_at: now,
		author_id,
		location
	};
}

// Helper: compute vote summary (weighted)
export function computeVoteSummary(votes: Vote[]): VoteSummary {
	const summary: VoteSummary = { support: 0, reject: 0, neutral: 0, total: 0, voters: 0 };
	for (const vote of votes) {
		const w = vote.weight || 1;
		summary[vote.type] += w;
		summary.total += w;
		summary.voters += 1;
	}
	return summary;
}

// ---- Lifecycle re-evaluation + tier placement ----
function tierForState(state: LifecycleState): 'hot' | 'warm' | 'cold' {
	if (state === 'dormant') return 'cold';
	if (state === 'faded') return 'warm';
	return 'hot';
}

/**
 * Re-evaluate lifecycle for a thesis and (re-)place it into the correct tier.
 * Used on writes and by the background sweep.
 */
export function reevaluateLifecycle(thesis_id: string, nowMs = Date.now()): void {
	const found = findThesis(thesis_id);
	if (!found) return;
	const { thesis, tier } = found;

	const argIds = args_by_thesis.get(thesis_id);
	const args: Argument[] = [];
	if (argIds) {
		for (const argId of argIds) {
			const a = arguments_store.get(argId);
			if (a) args.push(a);
		}
	}

	const { state, quality_score } = computeLifecycle(thesis, args, nowMs);
	const previousState = thesis.lifecycle?.state;
	if (previousState !== state) {
		thesis.lifecycle = {
			state,
			state_since: new Date(nowMs).toISOString(),
			quality_score
		};
	} else {
		thesis.lifecycle = {
			state,
			state_since: thesis.lifecycle?.state_since ?? new Date(nowMs).toISOString(),
			quality_score
		};
	}

	const targetTier = tierForState(state);
	if (targetTier !== tier) {
		// Move between maps
		if (tier === 'hot') theses_hot.delete(thesis_id);
		else if (tier === 'warm') theses_warm.delete(thesis_id);
		else theses_cold.delete(thesis_id);

		if (targetTier === 'hot') theses_hot.set(thesis_id, thesis);
		else if (targetTier === 'warm') theses_warm.set(thesis_id, thesis);
		else theses_cold.set(thesis_id, thesis);

		if (!suppressLifecycleLogs) {
			logger.info('lifecycle', `tier change: ${tier} → ${targetTier}`, {
				thesis_id,
				state: previousState ?? '(none)',
				new_state: state
			});
		}
	}

	if (previousState && previousState !== state && !suppressLifecycleLogs) {
		logger.info('lifecycle', `state transition: ${previousState} → ${state}`, {
			thesis_id,
			quality: Number(quality_score.toFixed(3))
		});
	}
}

// --- Thesis operations ---

/** All theses across all tiers. AVOID in hot paths at scale. */
export function getAllTheses(): Thesis[] {
	const out: Thesis[] = new Array(theses_hot.size + theses_warm.size + theses_cold.size);
	let i = 0;
	for (const t of theses_hot.values()) out[i++] = t;
	for (const t of theses_warm.values()) out[i++] = t;
	for (const t of theses_cold.values()) out[i++] = t;
	return out;
}

/** Only hot-tier theses (active discussion). Prefer this for user-facing lists. */
export function getHotTheses(): Thesis[] {
	return Array.from(theses_hot.values());
}

export function getThesisById(id: string): Thesis | undefined {
	return findThesis(id)?.thesis;
}

export function tierStats(): { hot: number; warm: number; cold: number; total: number } {
	return {
		hot: theses_hot.size,
		warm: theses_warm.size,
		cold: theses_cold.size,
		total: theses_hot.size + theses_warm.size + theses_cold.size
	};
}

// ---- Internal helpers to keep the reverse index in sync ----
function indexArgument(arg: Argument): void {
	let set = args_by_thesis.get(arg.thesis_id);
	if (!set) {
		set = new Set();
		args_by_thesis.set(arg.thesis_id, set);
	}
	set.add(arg.id);
}

function unindexArgument(arg: Argument): void {
	const set = args_by_thesis.get(arg.thesis_id);
	if (!set) return;
	set.delete(arg.id);
	if (set.size === 0) args_by_thesis.delete(arg.thesis_id);
}

// ---- Legacy compatibility shim ----
// Older code paths use a single `theses` Map. We provide a proxy-like helper
// with just the surface we actually need. Prefer the tier-aware helpers above.
const theses = {
	get size() {
		return theses_hot.size + theses_warm.size + theses_cold.size;
	},
	get(id: string): Thesis | undefined {
		return findThesis(id)?.thesis;
	},
	set(id: string, thesis: Thesis): void {
		// Default new theses to hot; lifecycle re-eval will re-tier later.
		const existing = findThesis(id);
		if (existing) {
			// Update in place - keep current tier; caller may call reevaluateLifecycle
			existing.thesis.title = thesis.title;
			existing.thesis.description = thesis.description;
			existing.thesis.categories = thesis.categories;
			existing.thesis.votes = thesis.votes;
			existing.thesis.related_thesis_ids = thesis.related_thesis_ids;
			existing.thesis.archived = thesis.archived;
			existing.thesis.lifecycle = thesis.lifecycle;
			existing.thesis.meta = thesis.meta;
			return;
		}
		theses_hot.set(id, thesis);
	},
	delete(id: string): boolean {
		return theses_hot.delete(id) || theses_warm.delete(id) || theses_cold.delete(id);
	},
	has(id: string): boolean {
		return theses_hot.has(id) || theses_warm.has(id) || theses_cold.has(id);
	},
	*values(): IterableIterator<Thesis> {
		for (const t of theses_hot.values()) yield t;
		for (const t of theses_warm.values()) yield t;
		for (const t of theses_cold.values()) yield t;
	},
	*entries(): IterableIterator<[string, Thesis]> {
		for (const e of theses_hot.entries()) yield e;
		for (const e of theses_warm.entries()) yield e;
		for (const e of theses_cold.entries()) yield e;
	}
};

export function createThesis(
	title: string,
	description: string,
	categories: Thesis['categories'],
	author_id: string,
	location?: string
): Thesis {
	const nowIso = new Date().toISOString();
	const thesis: Thesis = {
		id: generateId(),
		title,
		description,
		categories,
		votes: [],
		related_thesis_ids: [],
		archived: false,
		lifecycle: {
			state: 'seedling',
			state_since: nowIso,
			quality_score: 0
		},
		meta: createMeta(author_id, location)
	};
	theses_hot.set(thesis.id, thesis);
	bumpVersion();
	logger.info('store', 'thesis created', {
		thesis_id: thesis.id,
		title: title.length > 60 ? title.slice(0, 57) + '…' : title,
		categories
	});
	return thesis;
}

export function updateThesis(
	id: string,
	updates: Partial<Pick<Thesis, 'title' | 'description' | 'categories'>>,
	user_id?: string
): Thesis | { error: string } {
	const thesis = theses.get(id);
	if (!thesis) return { error: 'Thesis not found' };
	// Only author can edit
	if (user_id && thesis.meta.author_id !== user_id) {
		return { error: 'Only the author can edit this thesis' };
	}

	if (updates.title !== undefined) thesis.title = updates.title;
	if (updates.description !== undefined) thesis.description = updates.description;
	if (updates.categories !== undefined) thesis.categories = updates.categories;
	thesis.meta.updated_at = new Date().toISOString();

	theses.set(id, thesis);
	bumpVersion();
	return thesis;
}

export function archiveThesis(id: string, archived: boolean = true): Thesis | undefined {
	const thesis = theses.get(id);
	if (!thesis) return undefined;
	thesis.archived = archived;
	thesis.meta.updated_at = new Date().toISOString();
	theses.set(id, thesis);
	bumpVersion();
	logger.info('store', archived ? 'thesis archived' : 'thesis unarchived', { thesis_id: id });
	return thesis;
}

export function deleteThesis(id: string): boolean {
	// Also delete all arguments for this thesis - use reverse index
	const argIds = args_by_thesis.get(id);
	const removedArgs = argIds?.size ?? 0;
	if (argIds) {
		for (const argId of argIds) arguments_store.delete(argId);
		args_by_thesis.delete(id);
	}
	const ok = theses.delete(id);
	if (ok) {
		bumpVersion();
		logger.warn('store', 'thesis deleted', { thesis_id: id, cascaded_arguments: removedArgs });
	}
	return ok;
}

export function voteOnThesis(
	thesis_id: string,
	user_id: string,
	type: Vote['type'],
	weight: number = 1
): Thesis | undefined {
	const thesis = theses.get(thesis_id);
	if (!thesis) return undefined;

	// Sanitise weight - always at least 1, cap at 5 for safety.
	const w = Math.max(1, Math.min(5, Math.floor(weight)));

	// Check if user already has a vote on this thesis.
	const existingVote = thesis.votes.find((v) => v.user_id === user_id);
	let action: 'retracted' | 'changed' | 'added' | 'reweighted';
	if (existingVote && existingVote.type === type && (existingVote.weight ?? 1) === w) {
		// Same type + same weight => retract completely.
		thesis.votes = thesis.votes.filter((v) => v.user_id !== user_id);
		action = 'retracted';
	} else if (existingVote) {
		thesis.votes = thesis.votes.filter((v) => v.user_id !== user_id);
		thesis.votes.push({
			user_id,
			type,
			weight: w,
			cast_at: new Date().toISOString()
		});
		action = existingVote.type === type ? 'reweighted' : 'changed';
	} else {
		thesis.votes.push({
			user_id,
			type,
			weight: w,
			cast_at: new Date().toISOString()
		});
		action = 'added';
	}

	thesis.meta.updated_at = new Date().toISOString();
	reevaluateLifecycle(thesis_id);
	bumpVersion();
	logger.debug('store', `vote ${action} on thesis`, {
		thesis_id,
		type,
		weight: w,
		action
	});
	return thesis;
}

export function getTrendingTheses(limit: number = 10): Thesis[] {
	// Trending = hot tier only, sorted by vote count.
	// Filters out archived and everything that isn't currently active.
	const arr: Thesis[] = [];
	for (const t of theses_hot.values()) {
		if (!t.archived) arr.push(t);
	}
	arr.sort((a, b) => b.votes.length - a.votes.length);
	return arr.slice(0, limit);
}

// ---- Simple TTL cache for expensive derived queries ----
// Invalidated on mutations; also stale after CACHE_TTL_MS.
const CACHE_TTL_MS = 30_000; // 30s

let _heatCache: { at: number; data: Map<string, number> } | null = null;
let _argCountsCache: { at: number; data: Map<string, number> } | null = null;
let _activityCache = new Map<string, { at: number; data: ActivityDay[] }>();
let _dataVersion = 0; // bumped on every write; cache entries store the version they were built from

function bumpVersion() {
	_dataVersion++;
	_heatCache = null;
	_argCountsCache = null;
	_activityCache.clear();
}

// Heat calculation: relative 24h activity
// O(N + M) - single pass over theses + arguments, timestamps parsed once
export function getHeatMap(): Map<string, number> {
	if (_heatCache && Date.now() - _heatCache.at < CACHE_TTL_MS) {
		logger.debug('cache', 'heatMap hit', { age_ms: Date.now() - _heatCache.at, size: _heatCache.data.size });
		return _heatCache.data;
	}
	const start = Date.now();

	const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
	const heatMap = new Map<string, number>();

	// Heat only makes sense for the hot tier. Warm/cold theses had no recent activity
	// by definition (that's why they're in warm/cold). Skip them - saves 50-80% of work.
	for (const thesis of theses_hot.values()) {
		let count = 0;
		for (const v of thesis.votes) {
			if (Date.parse(v.cast_at) > oneDayAgo) count++;
		}
		heatMap.set(thesis.id, count);
	}

	// Only iterate arguments belonging to hot theses.
	// Use the reverse index for O(1) filtering.
	for (const [thesisId] of theses_hot) {
		const argIds = args_by_thesis.get(thesisId);
		if (!argIds) continue;
		let localCount = 0;
		for (const argId of argIds) {
			const arg = arguments_store.get(argId);
			if (!arg) continue;
			if (Date.parse(arg.meta.created_at) > oneDayAgo) localCount++;
			for (const v of arg.votes) {
				if (Date.parse(v.cast_at) > oneDayAgo) localCount++;
			}
		}
		if (localCount > 0) {
			heatMap.set(thesisId, (heatMap.get(thesisId) ?? 0) + localCount);
		}
	}

	// Compute average activity
	let totalActivity = 0;
	let activeThesesCount = 0;
	for (const activity of heatMap.values()) {
		if (activity > 0) {
			totalActivity += activity;
			activeThesesCount++;
		}
	}
	const avgActivity = activeThesesCount > 0 ? totalActivity / activeThesesCount : 1;

	// Normalise
	for (const [id, activity] of heatMap) {
		heatMap.set(id, avgActivity > 0 ? activity / avgActivity : 0);
	}

	_heatCache = { at: Date.now(), data: heatMap };
	logger.debug('cache', 'heatMap miss (recomputed)', {
		size: heatMap.size,
		duration_ms: Date.now() - start
	});
	return heatMap;
}

// Get argument count per thesis (cached, hot tier only)
export function getArgumentCounts(): Map<string, number> {
	if (_argCountsCache && Date.now() - _argCountsCache.at < CACHE_TTL_MS) {
		logger.debug('cache', 'argumentCounts hit', { size: _argCountsCache.data.size });
		return _argCountsCache.data;
	}
	const start = Date.now();
	const counts = new Map<string, number>();
	// Only count for hot theses - warm/cold aren't shown in default lists anyway.
	for (const thesisId of theses_hot.keys()) {
		const argIds = args_by_thesis.get(thesisId);
		counts.set(thesisId, argIds ? argIds.size : 0);
	}
	_argCountsCache = { at: Date.now(), data: counts };
	logger.debug('cache', 'argumentCounts miss (recomputed)', {
		size: counts.size,
		duration_ms: Date.now() - start
	});
	return counts;
}

// Activity calendar: GitHub-style per-day counts for last N days
export interface ActivityDay {
	date: string;
	support: number;
	reject: number;
	neutral: number;
	creates: number; // new theses + new arguments
	count: number; // total
}

export function getActivityCalendar(thesis_id: string | null, days: number = 84): ActivityDay[] {
	const cacheKey = `${thesis_id ?? '*'}::${days}`;
	const cached = _activityCache.get(cacheKey);
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
		logger.debug('cache', 'activityCalendar hit', { key: cacheKey });
		return cached.data;
	}
	const start = Date.now();

	const now = new Date();
	now.setUTCHours(0, 0, 0, 0);

	const buckets = new Map<string, ActivityDay>();
	for (let i = 0; i < days; i++) {
		const d = new Date(now);
		d.setUTCDate(d.getUTCDate() - i);
		const date = d.toISOString().slice(0, 10);
		buckets.set(date, { date, support: 0, reject: 0, neutral: 0, creates: 0, count: 0 });
	}

	// ISO 8601 strings are lexicographically sortable, so slice(0, 10) gives YYYY-MM-DD.
	// Faster than split('T')[0] because no regex/array allocation.
	function addCreate(iso: string) {
		const b = buckets.get(iso.slice(0, 10));
		if (b) {
			b.creates++;
			b.count++;
		}
	}

	function addVote(iso: string, type: 'support' | 'reject' | 'neutral') {
		const b = buckets.get(iso.slice(0, 10));
		if (b) {
			b[type]++;
			b.count++;
		}
	}

	if (thesis_id) {
		const thesis = theses.get(thesis_id);
		if (thesis) {
			addCreate(thesis.meta.created_at);
			for (const v of thesis.votes) addVote(v.cast_at, v.type);
			for (const arg of arguments_store.values()) {
				if (arg.thesis_id !== thesis_id) continue;
				addCreate(arg.meta.created_at);
				for (const v of arg.votes) addVote(v.cast_at, v.type);
			}
		}
	} else {
		// Platform-wide activity: only iterate hot tier. Warm/cold events are
		// definitionally outside the last 84 days for the recent buckets anyway.
		for (const thesis of theses_hot.values()) {
			addCreate(thesis.meta.created_at);
			for (const v of thesis.votes) addVote(v.cast_at, v.type);
		}
		// Iterate only args of hot theses via reverse index.
		for (const [thesisId] of theses_hot) {
			const argIds = args_by_thesis.get(thesisId);
			if (!argIds) continue;
			for (const argId of argIds) {
				const arg = arguments_store.get(argId);
				if (!arg) continue;
				addCreate(arg.meta.created_at);
				for (const v of arg.votes) addVote(v.cast_at, v.type);
			}
		}
	}

	const result = Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
	_activityCache.set(cacheKey, { at: Date.now(), data: result });
	logger.debug('cache', 'activityCalendar miss (recomputed)', {
		key: cacheKey,
		duration_ms: Date.now() - start
	});
	return result;
}

export function getTopTheses(limit: number = 10): Thesis[] {
	// Top = crystallized + canonical (highest quality) from hot tier.
	// Compute support count once per thesis instead of inside the comparator.
	const withCount: { thesis: Thesis; score: number }[] = [];
	for (const t of theses_hot.values()) {
		if (t.archived) continue;
		if (t.lifecycle.state !== 'crystallized' && t.lifecycle.state !== 'discussed') continue;
		let support = 0;
		for (const v of t.votes) if (v.type === 'support') support++;
		// Combine quality score with raw support - quality first
		const score = t.lifecycle.quality_score * 1000 + support;
		withCount.push({ thesis: t, score });
	}
	withCount.sort((a, b) => b.score - a.score);
	return withCount.slice(0, limit).map((x) => x.thesis);
}

// --- Argument operations ---

export function getArgumentsForThesis(thesis_id: string): Argument[] {
	return Array.from(arguments_store.values()).filter((a) => a.thesis_id === thesis_id);
}

export function getArgumentById(id: string): Argument | undefined {
	return arguments_store.get(id);
}

// ---- User-scoped aggregators (used by report generation) ----

export function getThesesByAuthor(user_id: string): Thesis[] {
	const out: Thesis[] = [];
	for (const t of getAllTheses()) {
		if (t.meta.author_id === user_id) out.push(t);
	}
	return out;
}

export function getArgumentsByAuthor(user_id: string): Argument[] {
	const out: Argument[] = [];
	for (const a of arguments_store.values()) {
		if (a.meta.author_id === user_id) out.push(a);
	}
	return out;
}

/** All theses the user has voted on (any vote type). */
export function getThesesVotedByUser(user_id: string): { thesis: Thesis; voteType: string }[] {
	const out: { thesis: Thesis; voteType: string }[] = [];
	for (const t of getAllTheses()) {
		const v = t.votes.find((x) => x.user_id === user_id);
		if (v) out.push({ thesis: t, voteType: v.type });
	}
	return out;
}

/**
 * All votes (thesis + argument) cast by user with cast_at >= sinceIso.
 * Used for budget/activity reconstruction — includes weight so callers can
 * separate free votes (weight=1) from weighted votes (weight>1).
 */
export function getVotesByUserSince(
	user_id: string,
	sinceIso: string
): {
	target: 'thesis' | 'argument';
	target_id: string;
	thesis_id: string;
	thesis_title: string;
	vote_type: string;
	weight: number;
	cast_at: string;
}[] {
	const out: {
		target: 'thesis' | 'argument';
		target_id: string;
		thesis_id: string;
		thesis_title: string;
		vote_type: string;
		weight: number;
		cast_at: string;
	}[] = [];
	for (const t of getAllTheses()) {
		for (const v of t.votes) {
			if (v.user_id === user_id && v.cast_at >= sinceIso) {
				out.push({
					target: 'thesis',
					target_id: t.id,
					thesis_id: t.id,
					thesis_title: t.title,
					vote_type: v.type,
					weight: v.weight,
					cast_at: v.cast_at
				});
			}
		}
	}
	for (const a of arguments_store.values()) {
		for (const v of a.votes) {
			if (v.user_id === user_id && v.cast_at >= sinceIso) {
				const parent = theses.get(a.thesis_id);
				out.push({
					target: 'argument',
					target_id: a.id,
					thesis_id: a.thesis_id,
					thesis_title: parent?.title ?? '(unknown thesis)',
					vote_type: v.type,
					weight: v.weight,
					cast_at: v.cast_at
				});
			}
		}
	}
	return out;
}

export function createArgument(
	thesis_id: string,
	content: string,
	attributes: Argument['attributes'],
	author_id: string,
	stance: Argument['stance'] = 'support',
	forked_from_id?: string
): Argument | { error: string } {
	if (!theses.has(thesis_id)) {
		return { error: 'Thesis not found' };
	}

	// Validate fork source exists (and is from same thesis + same stance)
	if (forked_from_id) {
		const source = arguments_store.get(forked_from_id);
		if (!source) return { error: 'Source argument not found' };
		if (source.thesis_id !== thesis_id) return { error: 'Fork source must be from same thesis' };
		if (source.stance !== stance) return { error: 'Fork must keep same stance' };
	}

	const argument: Argument = {
		id: generateId(),
		thesis_id,
		stance,
		content,
		attributes,
		votes: [],
		forked_from_id,
		meta: createMeta(author_id)
	};

	arguments_store.set(argument.id, argument);
	indexArgument(argument);
	reevaluateLifecycle(thesis_id);
	bumpVersion();
	logger.info('store', forked_from_id ? 'argument forked' : 'argument created', {
		argument_id: argument.id,
		thesis_id,
		stance,
		forked_from: forked_from_id ?? undefined
	});
	return argument;
}

export function updateArgument(
	id: string,
	updates: Partial<Pick<Argument, 'content' | 'attributes'>>,
	user_id?: string
): Argument | { error: string } {
	const argument = arguments_store.get(id);
	if (!argument) return { error: 'Argument not found' };
	if (user_id && argument.meta.author_id !== user_id) {
		return { error: 'Only the author can edit this argument' };
	}
	if (updates.content !== undefined) argument.content = updates.content;
	if (updates.attributes !== undefined) argument.attributes = updates.attributes;
	argument.meta.updated_at = new Date().toISOString();
	arguments_store.set(id, argument);
	bumpVersion();
	return argument;
}

export function voteOnArgument(
	argument_id: string,
	user_id: string,
	type: Vote['type'],
	weight: number = 1
): Argument | undefined {
	const argument = arguments_store.get(argument_id);
	if (!argument) return undefined;

	const w = Math.max(1, Math.min(5, Math.floor(weight)));
	const existingVote = argument.votes.find((v) => v.user_id === user_id);
	if (existingVote && existingVote.type === type && (existingVote.weight ?? 1) === w) {
		argument.votes = argument.votes.filter((v) => v.user_id !== user_id);
	} else {
		argument.votes = argument.votes.filter((v) => v.user_id !== user_id);
		argument.votes.push({
			user_id,
			type,
			weight: w,
			cast_at: new Date().toISOString()
		});
	}

	argument.meta.updated_at = new Date().toISOString();
	arguments_store.set(argument_id, argument);
	reevaluateLifecycle(argument.thesis_id);
	bumpVersion();
	logger.debug('store', 'vote on argument', {
		argument_id,
		thesis_id: argument.thesis_id,
		type,
		weight: w
	});
	return argument;
}

export function deleteArgument(id: string): boolean {
	const arg = arguments_store.get(id);
	if (!arg) return false;
	const ok = arguments_store.delete(id);
	if (ok) {
		unindexArgument(arg);
		reevaluateLifecycle(arg.thesis_id);
		bumpVersion();
	}
	return ok;
}

// --- Seed data for development ---

interface ThesisSeed {
	title: string;
	description: string;
	categories: string[];
}

const THESIS_SEEDS: ThesisSeed[] = [
	// policy
	{ title: 'Bedingungsloses Grundeinkommen sollte eingeführt werden', description: 'Ein monatliches Grundeinkommen für alle Bürger ohne Bedingungen könnte soziale Sicherheit und Freiheit vereinen.', categories: ['policy', 'economy', 'fairness'] },
	{ title: 'Wahlrecht ab 16 sollte Standard werden', description: 'Jüngere Menschen sind direkter von Langzeitentscheidungen betroffen und sollten mitbestimmen dürfen.', categories: ['policy', 'fairness'] },
	{ title: 'Lobbyregister sollten verpflichtend und öffentlich sein', description: 'Transparenz über Einflussnahme stärkt Vertrauen in demokratische Prozesse.', categories: ['policy'] },
	{ title: 'Volksentscheide auf Bundesebene sollten möglich sein', description: 'Direkte Demokratie kann repräsentative Demokratie ergänzen, nicht ersetzen.', categories: ['policy'] },
	{ title: 'Politiker sollten Vermögensoffenlegung pflichten', description: 'Wer öffentliche Entscheidungen trifft, muss finanzielle Interessenkonflikte offenlegen.', categories: ['policy', 'fairness'] },
	{ title: 'Abgeordnetenmandate sollten zeitlich begrenzt sein', description: 'Maximal zwei Legislaturperioden würden Erstarrung verhindern und Erneuerung fördern.', categories: ['policy'] },
	{ title: 'Wahlpflicht würde die Demokratie stärken', description: 'In Ländern wie Australien führt sie zu höherer Wahlbeteiligung und repräsentativeren Ergebnissen.', categories: ['policy'] },
	{ title: 'Parteienfinanzierung sollte rein staatlich sein', description: 'Privatspenden öffnen Tür für Einflussnahme. Staatliche Finanzierung sichert Unabhängigkeit.', categories: ['policy', 'fairness'] },

	// economy
	{ title: 'Erbschaftssteuer sollte deutlich erhöht werden', description: 'Vermögen über Generationen konzentriert sich. Eine höhere Besteuerung könnte Chancengleichheit erhöhen.', categories: ['economy', 'fairness'] },
	{ title: 'Vier-Tage-Woche sollte gesetzlicher Standard werden', description: 'Studien zeigen gleichbleibende Produktivität bei besserer Gesundheit und Work-Life-Balance.', categories: ['economy', 'health', 'family'] },
	{ title: 'Mindestlohn sollte automatisch an Inflation gekoppelt sein', description: 'Reallöhne dürfen nicht jedes Jahr neu politisch ausgehandelt werden müssen.', categories: ['economy', 'fairness'] },
	{ title: 'Aktienbeteiligung für Arbeitnehmer sollte verpflichtend werden', description: 'Mitarbeiter, die am Unternehmenserfolg beteiligt sind, identifizieren sich stärker.', categories: ['economy', 'fairness'] },
	{ title: 'Großkonzerne sollten höhere Steuersätze zahlen', description: 'Globale Konzerne nutzen Schlupflöcher. Eine Mindestbesteuerung schützt nationale Haushalte.', categories: ['economy', 'fairness'] },
	{ title: 'Banken sollten strenger reguliert werden', description: 'Systemische Risiken aus 2008 sind nicht vollständig gelöst. Höhere Eigenkapitalquoten wären sinnvoll.', categories: ['economy', 'policy'] },
	{ title: 'Wohnungsmarkt braucht stärkere Mietregulierung', description: 'Wohnen ist Grundbedürfnis. Spekulation auf Wohnraum sollte erschwert werden.', categories: ['economy', 'fairness', 'policy'] },
	{ title: 'Crypto sollte staatlich reguliert, aber nicht verboten werden', description: 'Innovation braucht Raum, aber Anlegerschutz und Geldwäscheprävention sind nötig.', categories: ['economy', 'technology'] },

	// education
	{ title: 'Schulnoten sollten abgeschafft werden', description: 'Numerische Bewertungen erzeugen Druck und messen nicht wirklich Kompetenz. Alternative Bewertungsformen wären besser.', categories: ['education', 'family'] },
	{ title: 'Programmieren sollte Pflichtfach werden', description: 'Digitale Kompetenz ist im 21. Jahrhundert so grundlegend wie Lesen und Schreiben.', categories: ['education', 'technology'] },
	{ title: 'Hausaufgaben sollten weitgehend abgeschafft werden', description: 'Sie reproduzieren soziale Ungleichheit und liefern wenig zusätzlichen Lernerfolg.', categories: ['education', 'family', 'fairness'] },
	{ title: 'Schule sollte später beginnen', description: 'Schlafforschung zeigt, dass Jugendliche von einem späteren Schulbeginn klar profitieren.', categories: ['education', 'health'] },
	{ title: 'Finanzbildung gehört in den Lehrplan', description: 'Junge Erwachsene verlassen die Schule, ohne Grundkenntnisse über Steuern, Zinsen oder Verträge.', categories: ['education', 'economy'] },
	{ title: 'Klassengrößen sollten gesetzlich auf 20 begrenzt werden', description: 'Kleinere Klassen ermöglichen individuelle Förderung und reduzieren Lehrerbelastung.', categories: ['education', 'fairness'] },
	{ title: 'Universitäten sollten weltweit gebührenfrei sein', description: 'Bildung ist ein Menschenrecht und sollte nicht vom Geldbeutel abhängen.', categories: ['education', 'fairness'] },
	{ title: 'Lehrer sollten deutlich besser bezahlt werden', description: 'Wer die nächste Generation prägt, sollte gesellschaftlich und finanziell anerkannt werden.', categories: ['education', 'fairness'] },
	{ title: 'Medienkompetenz sollte zentrales Schulfach werden', description: 'In einer Welt voller Desinformation ist kritische Medienanalyse Überlebensskill.', categories: ['education', 'technology'] },

	// health
	{ title: 'Cannabis-Legalisierung schützt Konsumenten besser als Verbot', description: 'Regulierte Märkte ermöglichen Qualitätskontrolle, Jugendschutz und entkriminalisieren Konsumenten.', categories: ['health', 'policy'] },
	{ title: 'Zucker sollte besteuert werden', description: 'Wie in Mexiko und UK reduziert eine Zuckersteuer nachweislich den Konsum und Folgeerkrankungen.', categories: ['health', 'policy'] },
	{ title: 'Psychotherapie sollte vollständig kassenfinanziert sein', description: 'Mentale Gesundheit ist gleichwertig zu körperlicher Gesundheit zu behandeln.', categories: ['health', 'fairness'] },
	{ title: 'Pflegekräfte sollten deutlich mehr verdienen', description: 'Systemrelevante Berufe brauchen Wertschätzung - auch finanziell.', categories: ['health', 'fairness', 'economy'] },
	{ title: 'Bewegung sollte gesetzlich in den Arbeitsalltag integriert sein', description: 'Bewegungsmangel kostet Volkswirtschaften Milliarden. Aktive Pausen wären nachweislich gesund.', categories: ['health', 'economy'] },
	{ title: 'Tabakwerbung sollte komplett verboten werden', description: 'Selbst indirekte Werbung erreicht Jugendliche und normalisiert Konsum.', categories: ['health', 'policy'] },
	{ title: 'Organspende sollte Widerspruchslösung haben', description: 'Wer nicht aktiv widerspricht, ist potenzieller Spender. Würde Wartelisten dramatisch verkürzen.', categories: ['health', 'fairness'] },
	{ title: 'Impfpflicht für Schulkinder ist verhältnismäßig', description: 'Herdenimmunität schützt auch jene, die sich nicht impfen lassen können.', categories: ['health', 'policy'] },

	// environment
	{ title: 'CO2-Preise müssen deutlich höher sein', description: 'Nur ein wirksamer Preis lenkt Verhalten. Aktuelle Werte spiegeln die wahren Kosten nicht wider.', categories: ['environment', 'economy', 'policy'] },
	{ title: 'Inlandsflüge unter 500km sollten verboten werden', description: 'Bahnverbindungen sind hier alternative Optionen mit drastisch niedrigerem CO2-Fußabdruck.', categories: ['environment', 'policy'] },
	{ title: 'Atomenergie ist Teil der Klimalösung', description: 'Trotz Risiken: niedrigste CO2-Bilanz unter den verlässlichen Stromquellen.', categories: ['environment', 'technology', 'policy'] },
	{ title: 'Fleischkonsum sollte stärker besteuert werden', description: 'Externalisierte Kosten (Klima, Wasser, Boden) müssen eingepreist werden.', categories: ['environment', 'health', 'economy'] },
	{ title: 'Plastikverpackung sollte radikal reduziert werden', description: 'Mikroplastik findet sich überall - in Blut, Muttermilch, Atmosphäre.', categories: ['environment', 'health'] },
	{ title: 'Tempolimit auf Autobahnen senkt CO2 effektiv', description: '130 km/h würden Millionen Tonnen CO2 sparen - bei minimalem Komfortverlust.', categories: ['environment', 'policy'] },
	{ title: 'Städte sollten autofrei werden', description: 'Lebenswerte Innenstädte brauchen Raum für Menschen, nicht für parkende Autos.', categories: ['environment', 'health'] },
	{ title: 'Massentierhaltung sollte gesetzlich abgeschafft werden', description: 'Sie verursacht Tierleid, Antibiotikaresistenzen und Klimaschäden gleichzeitig.', categories: ['environment', 'health', 'fairness'] },
	{ title: 'Wiederaufforstung sollte staatlich subventioniert werden', description: 'Wälder sind die kostengünstigsten Kohlenstoffspeicher, die wir haben.', categories: ['environment', 'policy'] },

	// technology
	{ title: 'Remote Work sollte der Standard sein', description: 'Die Pandemie hat gezeigt, dass viele Jobs remote funktionieren. Büropflicht ist ein Relikt.', categories: ['economy', 'technology', 'health'] },
	{ title: 'KI-generierte Inhalte sollten gekennzeichnet werden müssen', description: 'Transparenz ist essentiell, um Vertrauen in Information zu erhalten.', categories: ['technology', 'policy'] },
	{ title: 'Social Media sollte Algorithmen offenlegen', description: 'Wer öffentliche Diskurse formt, schuldet Transparenz über Funktionsweise.', categories: ['technology', 'policy', 'fairness'] },
	{ title: 'Internet sollte Grundrecht sein', description: 'Teilhabe an Bildung, Arbeit und Demokratie hängt heute vom Internetzugang ab.', categories: ['technology', 'fairness'] },
	{ title: 'Datenschutz sollte Standardeinstellung sein', description: 'Opt-out statt Opt-in für Tracking - die EU-DSGVO sollte global gelten.', categories: ['technology', 'policy', 'fairness'] },
	{ title: 'Open-Source-Software sollte Standard im öffentlichen Sektor sein', description: 'Steuergeld sollte nicht proprietäre Lock-in-Lösungen finanzieren.', categories: ['technology', 'policy'] },
	{ title: 'Smartphones sollten in Schulen verboten sein', description: 'Konzentration und soziales Lernen leiden unter ständiger Erreichbarkeit.', categories: ['technology', 'education', 'family'] },
	{ title: 'Right-to-Repair sollte gesetzlich verankert sein', description: 'Hersteller dürfen Reparaturen nicht durch Design oder Software-Sperren verhindern.', categories: ['technology', 'economy', 'environment'] },
	{ title: 'Gesichtserkennung im öffentlichen Raum sollte verboten werden', description: 'Massenüberwachung ist mit demokratischen Grundwerten nicht vereinbar.', categories: ['technology', 'policy'] },
	{ title: 'KI-Systeme im öffentlichen Sektor brauchen unabhängige Audits', description: 'Algorithmen entscheiden über Menschen - Verzerrungen müssen prüfbar sein.', categories: ['technology', 'policy', 'fairness'] },

	// family
	{ title: 'Elternzeit sollte gleichmäßig auf beide Partner verteilt sein', description: 'Geteilte Elternzeit reduziert Gender-Pay-Gap und stärkt Vater-Kind-Bindung.', categories: ['family', 'fairness'] },
	{ title: 'Kinderbetreuung sollte ab Geburt staatlich verfügbar sein', description: 'Wahlfreiheit für Eltern und früh-pädagogisch wertvoll.', categories: ['family', 'fairness', 'economy'] },
	{ title: 'Sorgerecht sollte standardmäßig gleichberechtigt sein', description: 'Kinder profitieren nachweislich von beiden Elternteilen - auch nach Trennung.', categories: ['family', 'fairness'] },
	{ title: 'Adoption durch gleichgeschlechtliche Paare sollte weltweit erlaubt sein', description: 'Studien zeigen: Kinder gedeihen in liebevollen Familien - unabhängig vom Geschlecht der Eltern.', categories: ['family', 'fairness'] },
	{ title: 'Großeltern sollten gesetzlich verankertes Umgangsrecht haben', description: 'Generationenübergreifende Bindungen sind wertvoll und schützenswert.', categories: ['family', 'fairness'] },
	{ title: 'Schwangerschaftsabbruch sollte vollständig entkriminalisiert werden', description: 'Frauen sollten über ihren Körper ohne strafrechtliche Drohung entscheiden können.', categories: ['family', 'fairness', 'health'] },

	// fairness
	{ title: 'Gender Pay Gap sollte aktiv durch Quoten geschlossen werden', description: 'Freiwilligkeit hat nicht gereicht. Verbindliche Quoten beschleunigen Gleichstellung.', categories: ['fairness', 'economy'] },
	{ title: 'Diversity-Quoten in Vorständen sollten gesetzlich sein', description: 'Diverse Teams treffen nachweislich bessere Entscheidungen - Quoten beschleunigen den Wandel.', categories: ['fairness', 'economy'] },
	{ title: 'Anonymisierte Bewerbungen sollten Standard werden', description: 'Studien zeigen weniger Diskriminierung durch namens-, alter- und herkunftsfreie Bewerbungen.', categories: ['fairness', 'economy'] },
	{ title: 'Geflüchtete sollten sofort arbeiten dürfen', description: 'Arbeitsverbote schaffen Abhängigkeit und verhindern Integration.', categories: ['fairness', 'economy', 'policy'] },
	{ title: 'Reichtum über 100 Millionen sollte stärker besteuert werden', description: 'Konzentration extremen Reichtums gefährdet demokratische Gleichheit.', categories: ['fairness', 'economy', 'policy'] },
	{ title: 'Hate Speech sollte konsequenter strafverfolgt werden', description: 'Online-Diskurs wird vergiftet, wenn Drohungen folgenlos bleiben.', categories: ['fairness', 'policy'] },
	{ title: 'Wahlkreise sollten unabhängig zugeschnitten werden', description: 'Gerrymandering verzerrt Mehrheiten. Unabhängige Kommissionen schützen die Stimme.', categories: ['fairness', 'policy'] },

	// culture
	{ title: 'Kulturförderung sollte transparent und meritbasiert sein', description: 'Öffentliche Mittel sollten nachvollziehbar und nicht politisch motiviert vergeben werden.', categories: ['culture', 'policy'] },
	{ title: 'Museen sollten kostenfreien Eintritt haben', description: 'Bildungsteilhabe darf nicht vom Geldbeutel abhängen.', categories: ['culture', 'fairness'] },
	{ title: 'Öffentlich-rechtlicher Rundfunk ist gesellschaftlich notwendig', description: 'Unabhängiger Journalismus braucht Schutz vor kommerziellem und politischem Druck.', categories: ['culture', 'policy'] },
	{ title: 'Sprachschutz darf Sprachwandel nicht verhindern', description: 'Sprache lebt durch Veränderung. Konservierungsversuche scheitern historisch.', categories: ['culture'] },
	{ title: 'Buchpreisbindung schützt Vielfalt', description: 'Ohne Preisbindung würden kleine Verlage und Buchhandlungen verschwinden.', categories: ['culture', 'economy'] },
	{ title: 'Streamingdienste sollten Künstler fairer entlohnen', description: 'Pro-Stream-Vergütungen sind in vielen Fällen ausbeuterisch niedrig.', categories: ['culture', 'fairness', 'economy'] },

	// other / mixed
	{ title: 'Verkehrswende braucht massiven ÖPNV-Ausbau', description: 'Klimaziele sind ohne attraktive Alternativen zum Auto nicht erreichbar.', categories: ['environment', 'policy', 'economy'] },
	{ title: 'Wohlstand sollte nicht nur über BIP gemessen werden', description: 'Lebensqualität, Glück und ökologische Bilanz gehören in die Messung.', categories: ['economy', 'health', 'environment'] },
	{ title: 'Sonntag als gemeinsamer Ruhetag sollte erhalten bleiben', description: 'Gemeinsame Zeit ist Kit gesellschaftlichen Zusammenhalts.', categories: ['family', 'culture', 'health'] },
	{ title: 'Werbung sollte auf öffentlichen Plätzen verboten werden', description: 'Öffentlicher Raum sollte nicht kommerziell vereinnahmt sein.', categories: ['culture', 'policy', 'environment'] },
	{ title: 'Tiere sollten Grundrechte im Gesetz verankert haben', description: 'Empfindungsfähige Wesen sind keine Sachen - das Recht muss das anerkennen.', categories: ['fairness', 'policy', 'environment'] },
	{ title: 'Recht auf Sterben sollte gesetzlich gesichert sein', description: 'Selbstbestimmung am Lebensende ist eine Frage der Menschenwürde.', categories: ['health', 'fairness', 'policy'] },
	{ title: 'Werbung gegenüber Kindern sollte verboten werden', description: 'Kinder können kommerzielle Manipulation nicht durchschauen - sie brauchen Schutz.', categories: ['family', 'fairness', 'culture'] },
	{ title: 'Lebensmittel sollten verpflichtende Nährwert-Ampel haben', description: 'Verbraucher haben Recht auf transparente, schnell verständliche Information.', categories: ['health', 'policy'] },
	{ title: 'Bargeld sollte erhalten bleiben', description: 'Anonyme Bezahlung ist Schutz vor totaler Überwachung des Konsums.', categories: ['policy', 'technology', 'fairness'] },
	{ title: 'Wahlcomputer sollten verboten bleiben', description: 'Demokratie braucht überprüfbare, transparente Wahlverfahren.', categories: ['policy', 'technology'] },
	{ title: 'Drogenpolitik sollte auf Schadensminimierung umsteuern', description: 'Repression hat versagt. Suchthilfe und Aufklärung wirken nachweislich besser.', categories: ['health', 'policy', 'fairness'] },
	{ title: 'Steuererklärungen sollten radikal vereinfacht werden', description: 'Der Staat hat die Daten schon. Eine vorausgefüllte Erklärung wäre überall möglich.', categories: ['policy', 'technology'] },
	{ title: 'Beamtenstatus sollte abgeschafft werden', description: 'Privilegien ohne Leistungsbezug sind im 21. Jahrhundert nicht mehr zu rechtfertigen.', categories: ['policy', 'fairness'] },
	{ title: 'Gerichte sollten digitale Akten verpflichtend nutzen', description: 'Papierberge verzögern Verfahren und blockieren Effizienz.', categories: ['policy', 'technology'] },
	{ title: 'Whistleblower brauchen besseren gesetzlichen Schutz', description: 'Wer öffentliche Missstände aufdeckt, darf nicht persönlich ruiniert werden.', categories: ['policy', 'fairness'] },
	{ title: 'Pressefreiheit ist nicht verhandelbar', description: 'Auch unbequemer Journalismus verdient höchsten Schutz.', categories: ['policy', 'culture', 'fairness'] },
	{ title: 'Globale Mindestbesteuerung von Konzernen ist überfällig', description: 'Race-to-the-bottom schadet allen außer den Konzernen selbst.', categories: ['economy', 'fairness', 'policy'] },
	{ title: 'Mietendeckel funktioniert nicht langfristig', description: 'Studien zeigen: Angebot schrumpft, Sanierung sinkt. Bessere Instrumente nötig.', categories: ['economy', 'policy'] },
	{ title: 'Cybersecurity sollte Pflichtfach in Unternehmen sein', description: 'Menschliches Verhalten ist die größte Schwachstelle - hier muss Bildung greifen.', categories: ['technology', 'economy'] },
	{ title: 'Open Government Data ist Demokratiemotor', description: 'Bürger können nur kontrollieren, was sie sehen können.', categories: ['policy', 'technology', 'fairness'] },
	{ title: 'Stadtbäume sollten gesetzlich besser geschützt sein', description: 'Sie sind Klimaanlagen, Lebensraum und Lebensqualität in einem.', categories: ['environment', 'health'] },
	{ title: 'Frühförderung wirkt nachhaltiger als spätere Unterstützung', description: 'Investitionen in die ersten 5 Lebensjahre zahlen sich vielfach zurück.', categories: ['education', 'family', 'economy'] },
	{ title: 'Tarifbindung sollte ausgeweitet werden', description: 'Sie schützt Arbeitnehmer und stabilisiert Wirtschaft - sinkt aber seit Jahren.', categories: ['economy', 'fairness'] },
	{ title: 'Ehrenamt sollte stärker honoriert werden', description: 'Gesellschaftlicher Zusammenhalt steht und fällt mit ehrenamtlichem Engagement.', categories: ['culture', 'family', 'fairness'] },
	{ title: 'Stadtplanung sollte 15-Minuten-Prinzip folgen', description: 'Alles Wichtige in 15 Minuten zu Fuß erreichbar - so leben wir gesünder und nachhaltiger.', categories: ['environment', 'health', 'family'] }
];

export function seedData(): void {
	if (theses_hot.size > 0 || theses_warm.size > 0 || theses_cold.size > 0) return;

	// Default seed: 200 examples (dev-friendly).
	// Override with QUAPPE_SEED_COUNT env var for stress-testing.
	const targetCount = Number(process.env.QUAPPE_SEED_COUNT ?? '200');
	const t0 = Date.now();

	// Argument templates - shared across cohorts
	const argTemplates: { support: string[]; reject: string[] } = {
		support: [
			'Studien aus mehreren Ländern stützen diese Position.',
			'Praktische Erfahrungen aus Pilotprojekten sind positiv.',
			'Es entspricht dem Verhältnismäßigkeitsprinzip.',
			'Andere Demokratien zeigen, dass es funktioniert.',
			'Volkswirtschaftliche Analysen sprechen dafür.',
			'Es schützt schwächere Gruppen ohne starke zu benachteiligen.',
			'Langfristig spart es Kosten und vermeidet Schäden.'
		],
		reject: [
			'Die Umsetzungskosten wären unverhältnismäßig hoch.',
			'Es könnte unbeabsichtigte Nebenwirkungen haben.',
			'Empirische Belege sind dünn und uneindeutig.',
			'Andere Länder haben es versucht und revidiert.',
			'Es greift in individuelle Freiheiten ein.',
			'Bessere Alternativen existieren bereits.',
			'Der bürokratische Aufwand wäre erheblich.'
		]
	};

	// Generate a pool of pseudo-users - scale with target count (rough: 1 user per 4 theses, min 25)
	const userCount = Math.max(25, Math.min(50000, Math.floor(targetCount / 4)));
	const users: string[] = [];
	for (let i = 0; i < userCount; i++) users.push(generateId());

	// Helper: random index
	const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
	const pickN = <T>(arr: T[], n: number): T[] => {
		// Fisher-Yates partial shuffle - O(n) instead of O(n log n)
		if (n >= arr.length) return [...arr];
		const result: T[] = new Array(n);
		const indices = new Set<number>();
		while (indices.size < n) indices.add(Math.floor(Math.random() * arr.length));
		let i = 0;
		for (const idx of indices) result[i++] = arr[idx];
		return result;
	};

	const NOW = Date.now();
	const DAY_MS = 24 * 60 * 60 * 1000;
	const pastDate = (maxDaysAgo: number, minDaysAgo = 0): string => {
		const range = maxDaysAgo - minDaysAgo;
		const offset = (minDaysAgo + Math.random() * range) * DAY_MS;
		return new Date(NOW - offset).toISOString();
	};

	// Distribution model - reflects the "crystallisation over time" reality:
	//   - 5%: fresh seedlings (age 0-7d, low vote count)
	//   - 15%: actively discussed / contested (age 7-30d, medium activity)
	//   - 15%: crystallised (age 30-90d, high activity, biased votes)
	//   - 45%: faded (age > 60d, low recent activity)
	//   -	20%: dormant (age > 90d, no recent activity)
	//
	// For small seeds (< 500) fall back to a lighter distribution so demo data stays lively.
	interface CohortConfig {
		fraction: number;
		ageDaysMin: number;
		ageDaysMax: number;
		activityDaysMin: number; // most recent activity within this range
		activityDaysMax: number;
		voteMin: number;
		voteMax: number;
		argMin: number;
		argMax: number;
		supportBias: number; // 0.5 = balanced, 0.85 = strong support consensus
	}

	const cohorts: CohortConfig[] =
		targetCount < 500
			? [
					{
						fraction: 1,
						ageDaysMin: 0,
						ageDaysMax: 60,
						activityDaysMin: 0,
						activityDaysMax: 20,
						voteMin: 0,
						voteMax: 15,
						argMin: 0,
						argMax: 4,
						supportBias: 0.55
					}
				]
			: [
					// seedling
					{ fraction: 0.05, ageDaysMin: 0, ageDaysMax: 7, activityDaysMin: 0, activityDaysMax: 2, voteMin: 0, voteMax: 3, argMin: 0, argMax: 1, supportBias: 0.55 },
					// discussed / contested
					{ fraction: 0.15, ageDaysMin: 7, ageDaysMax: 30, activityDaysMin: 0, activityDaysMax: 5, voteMin: 5, voteMax: 25, argMin: 1, argMax: 5, supportBias: 0.55 },
					// crystallised - highest quality
					{ fraction: 0.15, ageDaysMin: 30, ageDaysMax: 90, activityDaysMin: 0, activityDaysMax: 10, voteMin: 20, voteMax: 60, argMin: 3, argMax: 8, supportBias: 0.75 },
					// faded
					{ fraction: 0.45, ageDaysMin: 30, ageDaysMax: 120, activityDaysMin: 30, activityDaysMax: 85, voteMin: 0, voteMax: 10, argMin: 0, argMax: 2, supportBias: 0.5 },
					// dormant
					{ fraction: 0.2, ageDaysMin: 90, ageDaysMax: 365, activityDaysMin: 91, activityDaysMax: 360, voteMin: 0, voteMax: 5, argMin: 0, argMax: 1, supportBias: 0.5 }
				];

	const variationPrefixes = ['', 'Vorschlag: ', 'Debatte: ', 'These: ', 'Zur Diskussion: ', 'Frage: ', 'Position: '];
	const regionSuffixes = ['', ' (regional)', ' (überregional)', ' (bundesweit)', ' (europaweit)', ' (kommunal)'];

	// Distribute target count across cohorts by fraction
	const perCohortCount: number[] = cohorts.map((c) => Math.floor(c.fraction * targetCount));
	// Assign remainder to the largest cohort
	const assigned = perCohortCount.reduce((s, n) => s + n, 0);
	if (assigned < targetCount) {
		const largest = perCohortCount.reduce((maxIdx, n, i, arr) => (n > arr[maxIdx] ? i : maxIdx), 0);
		perCohortCount[largest] += targetCount - assigned;
	}

	const createdTheses: Thesis[] = new Array(targetCount);
	let idx = 0;
	let totalVotes = 0;
	let totalArgs = 0;
	let totalArgVotes = 0;

	for (let c = 0; c < cohorts.length; c++) {
		const cfg = cohorts[c];
		const n = perCohortCount[c];
		for (let k = 0; k < n; k++) {
			const seed = THESIS_SEEDS[idx % THESIS_SEEDS.length];
			const round = Math.floor(idx / THESIS_SEEDS.length);

			let title = seed.title;
			let description = seed.description;
			if (round > 0) {
				const prefix = variationPrefixes[round % variationPrefixes.length];
				const suffix = regionSuffixes[Math.floor(round / variationPrefixes.length) % regionSuffixes.length];
				title = `${prefix}${title}${suffix}`;
				description = `[Variante #${round}] ${description}`;
			}

			const author = pick(users);
			const created = pastDate(cfg.ageDaysMax, cfg.ageDaysMin);
			const thesis: Thesis = {
				id: generateId(),
				title,
				description,
				categories: seed.categories,
				votes: [],
				related_thesis_ids: [],
				archived: false,
				lifecycle: {
					state: 'seedling', // will be re-evaluated after data is seeded
					state_since: created,
					quality_score: 0
				},
				meta: {
					created_at: created,
					updated_at: new Date().toISOString(),
					author_id: author,
					location: 'DE'
				}
			};

			// Add votes matching cohort profile
			const voteCount = cfg.voteMin + Math.floor(Math.random() * (cfg.voteMax - cfg.voteMin + 1));
			const voters = pickN(users, Math.min(voteCount, users.length));
			for (const voter of voters) {
				const r = Math.random();
				let type: 'support' | 'reject' | 'neutral' = 'neutral';
				if (r < cfg.supportBias) type = 'support';
				else if (r < cfg.supportBias + (1 - cfg.supportBias) * 0.7) type = 'reject';
				// ~10% of votes have extra weight (2-3)
				const w = Math.random() < 0.1 ? 2 + Math.floor(Math.random() * 2) : 1;
				thesis.votes.push({
					user_id: voter,
					type,
					weight: w,
					cast_at: pastDate(cfg.activityDaysMax, cfg.activityDaysMin)
				});
				totalVotes++;
			}

			// Add arguments matching cohort profile
			const argCount = cfg.argMin + Math.floor(Math.random() * (cfg.argMax - cfg.argMin + 1));
			for (let ai = 0; ai < argCount; ai++) {
				const stance: 'support' | 'reject' = Math.random() < cfg.supportBias ? 'support' : 'reject';
				const argAuthor = pick(users);
				const arg: Argument = {
					id: generateId(),
					thesis_id: thesis.id,
					stance,
					content: pick(argTemplates[stance]),
					attributes: [{ evidence_type: pick(['logical', 'study', 'experiential', 'authority'] as const) }],
					votes: [],
					meta: {
						created_at: pastDate(cfg.activityDaysMax, cfg.activityDaysMin),
						updated_at: new Date().toISOString(),
						author_id: argAuthor
					}
				};
				const argVoteCount = Math.floor(Math.random() * 8);
				const argVoters = pickN(users, Math.min(argVoteCount, users.length));
				for (const v of argVoters) {
					arg.votes.push({
						user_id: v,
						type: pick(['support', 'reject', 'neutral'] as const),
						weight: 1,
						cast_at: pastDate(cfg.activityDaysMax, cfg.activityDaysMin)
					});
					totalArgVotes++;
				}
				arguments_store.set(arg.id, arg);
				indexArgument(arg);
				totalArgs++;
			}

			// Place initially in hot; lifecycle sweep below will move it to the correct tier.
			theses_hot.set(thesis.id, thesis);
			createdTheses[idx] = thesis;
			idx++;
		}
	}

	const t1 = Date.now();

	// Now that all votes / args are in place, run the lifecycle transition for every thesis
	// once so tiers are populated correctly.
	suppressLifecycleLogs = true;
	for (const thesis of createdTheses) {
		reevaluateLifecycle(thesis.id, NOW);
	}
	suppressLifecycleLogs = false;

	const t2 = Date.now();

	const memMB = (process.memoryUsage?.().heapUsed ?? 0) / (1024 * 1024);
	const stats = tierStats();
	logger.info('seed', `seeded ${createdTheses.length} theses`, {
		theses: createdTheses.length,
		arguments: totalArgs,
		thesis_votes: totalVotes,
		arg_votes: totalArgVotes,
		users: userCount
	});
	logger.info('seed', `tier distribution`, stats);
	logger.info('seed', `timing`, {
		seed_ms: t1 - t0,
		lifecycle_sweep_ms: t2 - t1,
		total_ms: t2 - t0,
		heap_mb: Number(memMB.toFixed(1))
	});
}

function daysAgo(iso: string): number {
	return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
}

