// Data-access façade for Quappe. Reads/writes go through better-sqlite3
// (src/lib/server/db/*); the in-memory derived caches (heat, arg-counts,
// activity) live here and are invalidated on every write via bumpVersion().

import type { Thesis, Argument, Vote, VoteSummary, LifecycleState } from '../models/types.ts';
import { computeLifecycle } from '../models/lifecycle.ts';
import { logger } from './logger.ts';

import { withTransaction } from '../server/db/index.ts';
import {
	dbDeleteThesis,
	dbGetAllTheses,
	dbGetHotTheses,
	dbGetThesesByAuthor,
	dbGetThesesMissingLang,
	dbGetThesisById,
	dbHasThesis,
	dbInsertThesesBulk,
	dbInsertThesis,
	dbSetThesisRelated,
	dbTierStats,
	dbUpdateThesisFields,
	dbUpdateThesisLifecycle
} from '../server/db/theses.ts';
import {
	dbCountArgumentsPerHotThesis,
	dbDeleteArgument,
	dbGetAllArguments,
	dbGetArgumentById,
	dbGetArgumentIdsForThesis,
	dbGetArgumentsByAuthor,
	dbGetArgumentsForThesis,
	dbGetForksOf,
	dbInsertArgument,
	dbInsertArgumentsBulk,
	dbSetArgumentCategories,
	dbUpdateArgumentFields
} from '../server/db/arguments.ts';
import {
	dbDeleteVote,
	dbGetThesisIdsVotedByUser,
	dbGetUserVoteOn,
	dbGetVotesByUserSince,
	dbUpsertVote
} from '../server/db/votes.ts';
import { dbGetAllEmbeddings, dbUpsertEmbedding } from '../server/db/embeddings.ts';

// ---- Embedding warm-cache ----
// Loaded on first access from DB, kept in-memory for fast semantic search.
// Writes are write-through (Map + DB).

let _thesis_embeddings: Map<string, Float32Array> | null = null;
let _argument_embeddings: Map<string, Float32Array> | null = null;

function thesisEmbeddings(): Map<string, Float32Array> {
	if (!_thesis_embeddings) _thesis_embeddings = dbGetAllEmbeddings('thesis');
	return _thesis_embeddings;
}

function argumentEmbeddings(): Map<string, Float32Array> {
	if (!_argument_embeddings) _argument_embeddings = dbGetAllEmbeddings('argument');
	return _argument_embeddings;
}

export function hasThesisEmbedding(id: string): boolean {
	return thesisEmbeddings().has(id);
}

export function setThesisEmbedding(id: string, vec: Float32Array): void {
	thesisEmbeddings().set(id, vec);
	dbUpsertEmbedding('thesis', id, vec);
}

export function setArgumentEmbedding(id: string, vec: Float32Array): void {
	argumentEmbeddings().set(id, vec);
	dbUpsertEmbedding('argument', id, vec);
}

export function getThesesWithEmbeddings(): { thesis: Thesis; embedding: Float32Array }[] {
	const result: { thesis: Thesis; embedding: Float32Array }[] = [];
	for (const [id, embedding] of thesisEmbeddings()) {
		const t = dbGetThesisById(id);
		if (t && !t.archived) result.push({ thesis: t, embedding });
	}
	return result;
}

export function getArgumentsWithEmbeddings(): { argument: Argument; embedding: Float32Array }[] {
	const result: { argument: Argument; embedding: Float32Array }[] = [];
	for (const [id, embedding] of argumentEmbeddings()) {
		const a = dbGetArgumentById(id);
		if (a) result.push({ argument: a, embedding });
	}
	return result;
}

// ---- Helpers ----

let suppressLifecycleLogs = false;

function generateId(): string {
	return crypto.randomUUID();
}

function nowIso(): string {
	return new Date().toISOString();
}

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

function tierForState(state: LifecycleState): 'hot' | 'warm' | 'cold' {
	if (state === 'dormant') return 'cold';
	if (state === 'faded') return 'warm';
	return 'hot';
}

/**
 * Re-evaluate lifecycle for a thesis and persist the new state.
 * Called on every write path and by the background sweep.
 */
export function reevaluateLifecycle(thesis_id: string, nowMs = Date.now()): void {
	const thesis = dbGetThesisById(thesis_id);
	if (!thesis) return;
	const args = dbGetArgumentsForThesis(thesis_id);
	const { state, quality_score } = computeLifecycle(thesis, args, nowMs);
	const previousState = thesis.lifecycle.state;
	const state_since =
		previousState !== state ? new Date(nowMs).toISOString() : thesis.lifecycle.state_since;
	dbUpdateThesisLifecycle(thesis_id, state, state_since, quality_score);

	if (previousState !== state && !suppressLifecycleLogs) {
		const oldTier = tierForState(previousState);
		const newTier = tierForState(state);
		if (oldTier !== newTier) {
			logger.info('lifecycle', `tier change: ${oldTier} → ${newTier}`, {
				thesis_id,
				state: previousState,
				new_state: state
			});
		}
		logger.info('lifecycle', `state transition: ${previousState} → ${state}`, {
			thesis_id,
			quality: Number(quality_score.toFixed(3))
		});
	}
}

// ---- Thesis operations ----

export function getAllTheses(): Thesis[] {
	return dbGetAllTheses();
}

export function getHotTheses(): Thesis[] {
	return dbGetHotTheses();
}

export function getThesisById(id: string): Thesis | undefined {
	return dbGetThesisById(id);
}

export function tierStats(): { hot: number; warm: number; cold: number; total: number } {
	return dbTierStats();
}

export function createThesis(
	title: string,
	description: string,
	categories: Thesis['categories'],
	author_id: string,
	location?: string
): Thesis {
	const created = nowIso();
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
			state_since: created,
			quality_score: 0
		},
		meta: {
			created_at: created,
			updated_at: created,
			author_id,
			location
		}
	};
	dbInsertThesis(thesis);
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
	const thesis = dbGetThesisById(id);
	if (!thesis) return { error: 'Thesis not found' };
	if (user_id && thesis.meta.author_id !== user_id) {
		return { error: 'Only the author can edit this thesis' };
	}
	const updated_at = nowIso();
	dbUpdateThesisFields(id, {
		title: updates.title,
		description: updates.description,
		categories: updates.categories,
		updated_at
	});
	bumpVersion();
	return dbGetThesisById(id)!;
}

export function archiveThesis(id: string, archived: boolean = true): Thesis | undefined {
	const thesis = dbGetThesisById(id);
	if (!thesis) return undefined;
	dbUpdateThesisFields(id, { archived, updated_at: nowIso() });
	bumpVersion();
	logger.info('store', archived ? 'thesis archived' : 'thesis unarchived', { thesis_id: id });
	return dbGetThesisById(id);
}

export function setThesisLang(id: string, lang: string): boolean {
	if (!dbHasThesis(id)) return false;
	dbUpdateThesisFields(id, { lang, updated_at: nowIso() });
	return true;
}

export function getThesesMissingLang(): Thesis[] {
	return dbGetThesesMissingLang();
}

export function setThesisRelated(id: string, related_ids: string[]): boolean {
	if (!dbHasThesis(id)) return false;
	dbSetThesisRelated(id, related_ids);
	bumpVersion();
	return true;
}

export function deleteThesis(id: string): boolean {
	const argIds = dbGetArgumentIdsForThesis(id);
	const ok = dbDeleteThesis(id);
	if (ok) {
		// Cascade for arguments is ON DELETE CASCADE at DB level; drop embeddings too.
		for (const argId of argIds) argumentEmbeddings().delete(argId);
		thesisEmbeddings().delete(id);
		bumpVersion();
		logger.warn('store', 'thesis deleted', { thesis_id: id, cascaded_arguments: argIds.length });
	}
	return ok;
}

export function voteOnThesis(
	thesis_id: string,
	user_id: string,
	type: Vote['type'],
	weight: number = 1
): Thesis | undefined {
	if (!dbHasThesis(thesis_id)) return undefined;

	const w = Math.max(1, Math.min(5, Math.floor(weight)));
	const existingVote = dbGetUserVoteOn('thesis', thesis_id, user_id);
	let action: 'retracted' | 'changed' | 'added' | 'reweighted';
	if (existingVote && existingVote.type === type && (existingVote.weight ?? 1) === w) {
		dbDeleteVote('thesis', thesis_id, user_id);
		action = 'retracted';
	} else if (existingVote) {
		dbUpsertVote('thesis', thesis_id, user_id, type, w, nowIso());
		action = existingVote.type === type ? 'reweighted' : 'changed';
	} else {
		dbUpsertVote('thesis', thesis_id, user_id, type, w, nowIso());
		action = 'added';
	}

	dbUpdateThesisFields(thesis_id, { updated_at: nowIso() });
	reevaluateLifecycle(thesis_id);
	bumpVersion();
	logger.debug('store', `vote ${action} on thesis`, {
		thesis_id,
		type,
		weight: w,
		action
	});
	return dbGetThesisById(thesis_id);
}

export function getTrendingTheses(limit: number = 10): Thesis[] {
	const arr = dbGetHotTheses().filter((t) => !t.archived);
	arr.sort((a, b) => b.votes.length - a.votes.length);
	return arr.slice(0, limit);
}

// ---- Derived caches (in-memory, invalidated on writes) ----

const CACHE_TTL_MS = 30_000;

let _heatCache: { at: number; data: Map<string, number> } | null = null;
let _argCountsCache: { at: number; data: Map<string, number> } | null = null;
let _activityCache = new Map<string, { at: number; data: ActivityDay[] }>();
let _dataVersion = 0;

function bumpVersion() {
	_dataVersion++;
	_heatCache = null;
	_argCountsCache = null;
	_activityCache.clear();
}

export function getHeatMap(): Map<string, number> {
	if (_heatCache && Date.now() - _heatCache.at < CACHE_TTL_MS) {
		logger.debug('cache', 'heatMap hit', { age_ms: Date.now() - _heatCache.at, size: _heatCache.data.size });
		return _heatCache.data;
	}
	const start = Date.now();

	const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
	const heatMap = new Map<string, number>();

	const hot = dbGetHotTheses();
	for (const thesis of hot) {
		let count = 0;
		for (const v of thesis.votes) {
			if (Date.parse(v.cast_at) > oneDayAgo) count++;
		}
		heatMap.set(thesis.id, count);
	}

	// Load all arguments for hot theses in one pass — this keeps parity with the
	// old in-memory implementation. At the current seed size (~500 args) this is
	// cheap; at scale we'd move to a SQL GROUP BY WHERE cast_at > ...
	for (const thesis of hot) {
		const argIds = dbGetArgumentIdsForThesis(thesis.id);
		if (argIds.length === 0) continue;
		let localCount = 0;
		for (const argId of argIds) {
			const arg = dbGetArgumentById(argId);
			if (!arg) continue;
			if (Date.parse(arg.meta.created_at) > oneDayAgo) localCount++;
			for (const v of arg.votes) {
				if (Date.parse(v.cast_at) > oneDayAgo) localCount++;
			}
		}
		if (localCount > 0) {
			heatMap.set(thesis.id, (heatMap.get(thesis.id) ?? 0) + localCount);
		}
	}

	let totalActivity = 0;
	let activeThesesCount = 0;
	for (const activity of heatMap.values()) {
		if (activity > 0) {
			totalActivity += activity;
			activeThesesCount++;
		}
	}
	const avgActivity = activeThesesCount > 0 ? totalActivity / activeThesesCount : 1;

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

export function getArgumentCounts(): Map<string, number> {
	if (_argCountsCache && Date.now() - _argCountsCache.at < CACHE_TTL_MS) {
		logger.debug('cache', 'argumentCounts hit', { size: _argCountsCache.data.size });
		return _argCountsCache.data;
	}
	const start = Date.now();
	const counts = dbCountArgumentsPerHotThesis();
	// Include zero-count hot theses so callers get a stable size.
	for (const t of dbGetHotTheses()) {
		if (!counts.has(t.id)) counts.set(t.id, 0);
	}
	_argCountsCache = { at: Date.now(), data: counts };
	logger.debug('cache', 'argumentCounts miss (recomputed)', {
		size: counts.size,
		duration_ms: Date.now() - start
	});
	return counts;
}

export interface ActivityDay {
	date: string;
	support: number;
	reject: number;
	neutral: number;
	creates: number;
	count: number;
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
		const thesis = dbGetThesisById(thesis_id);
		if (thesis) {
			addCreate(thesis.meta.created_at);
			for (const v of thesis.votes) addVote(v.cast_at, v.type);
			for (const arg of dbGetArgumentsForThesis(thesis_id)) {
				addCreate(arg.meta.created_at);
				for (const v of arg.votes) addVote(v.cast_at, v.type);
			}
		}
	} else {
		const hot = dbGetHotTheses();
		for (const thesis of hot) {
			addCreate(thesis.meta.created_at);
			for (const v of thesis.votes) addVote(v.cast_at, v.type);
		}
		for (const thesis of hot) {
			for (const arg of dbGetArgumentsForThesis(thesis.id)) {
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
	const withCount: { thesis: Thesis; score: number }[] = [];
	for (const t of dbGetHotTheses()) {
		if (t.archived) continue;
		if (t.lifecycle.state !== 'crystallized' && t.lifecycle.state !== 'discussed') continue;
		let support = 0;
		for (const v of t.votes) if (v.type === 'support') support++;
		const score = t.lifecycle.quality_score * 1000 + support;
		withCount.push({ thesis: t, score });
	}
	withCount.sort((a, b) => b.score - a.score);
	return withCount.slice(0, limit).map((x) => x.thesis);
}

// ---- Argument operations ----

export function getArgumentsForThesis(thesis_id: string): Argument[] {
	return dbGetArgumentsForThesis(thesis_id);
}

export function getArgumentById(id: string): Argument | undefined {
	return dbGetArgumentById(id);
}

export function getForksOf(argument_id: string): Argument[] {
	return dbGetForksOf(argument_id);
}

export function getThesesByAuthor(user_id: string): Thesis[] {
	return dbGetThesesByAuthor(user_id);
}

export function getArgumentsByAuthor(user_id: string): Argument[] {
	return dbGetArgumentsByAuthor(user_id);
}

export function getThesesVotedByUser(
	user_id: string
): { thesis: Thesis; voteType: string }[] {
	const rows = dbGetThesisIdsVotedByUser(user_id);
	const out: { thesis: Thesis; voteType: string }[] = [];
	for (const r of rows) {
		const t = dbGetThesisById(r.thesis_id);
		if (t) out.push({ thesis: t, voteType: r.vote_type });
	}
	return out;
}

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
	return dbGetVotesByUserSince(user_id, sinceIso);
}

export function createArgument(
	thesis_id: string,
	content: string,
	attributes: Argument['attributes'],
	author_id: string,
	stance: Argument['stance'] = 'support',
	forked_from_id?: string
): Argument | { error: string } {
	if (!dbHasThesis(thesis_id)) {
		return { error: 'Thesis not found' };
	}

	if (forked_from_id) {
		const source = dbGetArgumentById(forked_from_id);
		if (!source) return { error: 'Source argument not found' };
		if (source.thesis_id !== thesis_id) return { error: 'Fork source must be from same thesis' };
		if (source.stance !== stance) return { error: 'Fork must keep same stance' };
	}

	const created = nowIso();
	const argument: Argument = {
		id: generateId(),
		thesis_id,
		stance,
		content,
		attributes,
		votes: [],
		forked_from_id,
		meta: {
			created_at: created,
			updated_at: created,
			author_id
		}
	};

	dbInsertArgument(argument);
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
	const argument = dbGetArgumentById(id);
	if (!argument) return { error: 'Argument not found' };
	if (user_id && argument.meta.author_id !== user_id) {
		return { error: 'Only the author can edit this argument' };
	}
	dbUpdateArgumentFields(id, {
		content: updates.content,
		attributes: updates.attributes,
		updated_at: nowIso()
	});
	bumpVersion();
	return dbGetArgumentById(id)!;
}

export function setArgumentCategories(id: string, categories: string[]): boolean {
	const ok = dbSetArgumentCategories(id, categories);
	if (ok) bumpVersion();
	return ok;
}

export function getAllArguments(): Argument[] {
	return dbGetAllArguments();
}

export function voteOnArgument(
	argument_id: string,
	user_id: string,
	type: Vote['type'],
	weight: number = 1
): Argument | undefined {
	const argument = dbGetArgumentById(argument_id);
	if (!argument) return undefined;

	const w = Math.max(1, Math.min(5, Math.floor(weight)));
	const existingVote = dbGetUserVoteOn('argument', argument_id, user_id);
	if (existingVote && existingVote.type === type && (existingVote.weight ?? 1) === w) {
		dbDeleteVote('argument', argument_id, user_id);
	} else {
		dbUpsertVote('argument', argument_id, user_id, type, w, nowIso());
	}

	dbUpdateArgumentFields(argument_id, { updated_at: nowIso() });
	reevaluateLifecycle(argument.thesis_id);
	bumpVersion();
	logger.debug('store', 'vote on argument', {
		argument_id,
		thesis_id: argument.thesis_id,
		type,
		weight: w
	});
	return dbGetArgumentById(argument_id);
}

export function deleteArgument(id: string): boolean {
	const arg = dbGetArgumentById(id);
	if (!arg) return false;
	const ok = dbDeleteArgument(id);
	if (ok) {
		argumentEmbeddings().delete(id);
		reevaluateLifecycle(arg.thesis_id);
		bumpVersion();
	}
	return ok;
}

// ---- Seed data for development ----

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

export function seedData(devUserId?: string): void {
	// Gate on empty DB — replaces the old "any-map-non-empty" check.
	// The seed writes to SQLite in a single transaction; a second run would violate PKs.
	const stats = dbTierStats();
	if (stats.total > 0) return;

	const targetCount = Number(process.env.QUAPPE_SEED_COUNT ?? '200');
	const t0 = Date.now();

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

	const userCount = Math.max(25, Math.min(50000, Math.floor(targetCount / 4)));
	const users: string[] = [];
	if (devUserId) users.push(devUserId);
	for (let i = 0; i < userCount; i++) users.push(generateId());

	const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
	const pickN = <T>(arr: T[], n: number): T[] => {
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

	interface CohortConfig {
		fraction: number;
		ageDaysMin: number;
		ageDaysMax: number;
		activityDaysMin: number;
		activityDaysMax: number;
		voteMin: number;
		voteMax: number;
		argMin: number;
		argMax: number;
		supportBias: number;
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
					{ fraction: 0.05, ageDaysMin: 0, ageDaysMax: 7, activityDaysMin: 0, activityDaysMax: 2, voteMin: 0, voteMax: 3, argMin: 0, argMax: 1, supportBias: 0.55 },
					{ fraction: 0.15, ageDaysMin: 7, ageDaysMax: 30, activityDaysMin: 0, activityDaysMax: 5, voteMin: 5, voteMax: 25, argMin: 1, argMax: 5, supportBias: 0.55 },
					{ fraction: 0.15, ageDaysMin: 30, ageDaysMax: 90, activityDaysMin: 0, activityDaysMax: 10, voteMin: 20, voteMax: 60, argMin: 3, argMax: 8, supportBias: 0.75 },
					{ fraction: 0.45, ageDaysMin: 30, ageDaysMax: 120, activityDaysMin: 30, activityDaysMax: 85, voteMin: 0, voteMax: 10, argMin: 0, argMax: 2, supportBias: 0.5 },
					{ fraction: 0.2, ageDaysMin: 90, ageDaysMax: 365, activityDaysMin: 91, activityDaysMax: 360, voteMin: 0, voteMax: 5, argMin: 0, argMax: 1, supportBias: 0.5 }
				];

	const variationPrefixes = ['', 'Vorschlag: ', 'Debatte: ', 'These: ', 'Zur Diskussion: ', 'Frage: ', 'Position: '];
	const regionSuffixes = ['', ' (regional)', ' (überregional)', ' (bundesweit)', ' (europaweit)', ' (kommunal)'];

	const perCohortCount: number[] = cohorts.map((c) => Math.floor(c.fraction * targetCount));
	const assigned = perCohortCount.reduce((s, n) => s + n, 0);
	if (assigned < targetCount) {
		const largest = perCohortCount.reduce((maxIdx, n, i, arr) => (n > arr[maxIdx] ? i : maxIdx), 0);
		perCohortCount[largest] += targetCount - assigned;
	}

	// Build everything in memory first, flush in a single transaction at the end.
	const seededTheses: Thesis[] = [];
	const seededArguments: Argument[] = [];
	// Votes are stored as flat rows keyed by (target_type, target_id, user_id)
	const seededVotes: {
		target_type: 'thesis' | 'argument';
		target_id: string;
		user_id: string;
		vote_type: 'support' | 'reject' | 'neutral';
		weight: number;
		cast_at: string;
	}[] = [];

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
					state: 'seedling',
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

			const voteCount = cfg.voteMin + Math.floor(Math.random() * (cfg.voteMax - cfg.voteMin + 1));
			const voters = pickN(users, Math.min(voteCount, users.length));
			for (const voter of voters) {
				const r = Math.random();
				let type: 'support' | 'reject' | 'neutral' = 'neutral';
				if (r < cfg.supportBias) type = 'support';
				else if (r < cfg.supportBias + (1 - cfg.supportBias) * 0.7) type = 'reject';
				const w = Math.random() < 0.1 ? 2 + Math.floor(Math.random() * 2) : 1;
				const vote: Vote = {
					user_id: voter,
					type,
					weight: w,
					cast_at: pastDate(cfg.activityDaysMax, cfg.activityDaysMin)
				};
				thesis.votes.push(vote);
				seededVotes.push({
					target_type: 'thesis',
					target_id: thesis.id,
					user_id: vote.user_id,
					vote_type: vote.type,
					weight: vote.weight,
					cast_at: vote.cast_at
				});
				totalVotes++;
			}

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
					const vote: Vote = {
						user_id: v,
						type: pick(['support', 'reject', 'neutral'] as const),
						weight: 1,
						cast_at: pastDate(cfg.activityDaysMax, cfg.activityDaysMin)
					};
					arg.votes.push(vote);
					seededVotes.push({
						target_type: 'argument',
						target_id: arg.id,
						user_id: vote.user_id,
						vote_type: vote.type,
						weight: vote.weight,
						cast_at: vote.cast_at
					});
					totalArgVotes++;
				}
				seededArguments.push(arg);
				totalArgs++;
			}

			seededTheses.push(thesis);
			idx++;
		}
	}

	// "My theses" cohort — three extra theses authored by the dev user.
	if (devUserId) {
		const myConfigs: Array<{ state: 'seedling' | 'discussed' | 'crystallized'; ageDays: number; voters: number; args: number; supportBias: number }> = [
			{ state: 'seedling', ageDays: 3, voters: 2, args: 1, supportBias: 0.55 },
			{ state: 'discussed', ageDays: 20, voters: 40, args: 15, supportBias: 0.55 },
			{ state: 'crystallized', ageDays: 60, voters: 150, args: 40, supportBias: 0.75 }
		];

		const otherArgsPool = seededArguments.filter((a) => a.meta.author_id !== devUserId).slice(0, 50);
		const myArgIds: string[] = [];

		for (let mi = 0; mi < myConfigs.length; mi++) {
			const cfg = myConfigs[mi];
			const seed = THESIS_SEEDS[(idx + mi) % THESIS_SEEDS.length];
			const created = pastDate(cfg.ageDays + 1, cfg.ageDays);
			const thesis: Thesis = {
				id: generateId(),
				title: `[Meine These] ${seed.title}`,
				description: seed.description,
				categories: seed.categories,
				votes: [],
				related_thesis_ids: [],
				archived: false,
				lifecycle: {
					state: 'seedling',
					state_since: created,
					quality_score: 0
				},
				meta: {
					created_at: created,
					updated_at: new Date().toISOString(),
					author_id: devUserId,
					location: 'DE'
				}
			};

			const voters = pickN(users.filter((u) => u !== devUserId), Math.min(cfg.voters, users.length - 1));
			for (const voter of voters) {
				const r = Math.random();
				let type: 'support' | 'reject' | 'neutral' = 'neutral';
				if (r < cfg.supportBias) type = 'support';
				else if (r < cfg.supportBias + (1 - cfg.supportBias) * 0.7) type = 'reject';
				const w = Math.random() < 0.1 ? 2 + Math.floor(Math.random() * 2) : 1;
				const vote: Vote = {
					user_id: voter,
					type,
					weight: w,
					cast_at: pastDate(Math.min(cfg.ageDays, 10))
				};
				thesis.votes.push(vote);
				seededVotes.push({
					target_type: 'thesis',
					target_id: thesis.id,
					user_id: vote.user_id,
					vote_type: vote.type,
					weight: vote.weight,
					cast_at: vote.cast_at
				});
				totalVotes++;
			}

			for (let ai = 0; ai < cfg.args; ai++) {
				const stance: 'support' | 'reject' = Math.random() < cfg.supportBias ? 'support' : 'reject';
				const argAuthor: string = ai % 7 === 0 ? devUserId : pick(users.filter((u) => u !== devUserId));
				const forkSource = Math.random() < 0.2 && otherArgsPool.length > 0 ? pick(otherArgsPool) : null;
				const arg: Argument = {
					id: generateId(),
					thesis_id: thesis.id,
					stance,
					content: pick(argTemplates[stance]),
					attributes: [{ evidence_type: pick(['logical', 'study', 'experiential', 'authority'] as const) }],
					votes: [],
					forked_from_id: forkSource?.id,
					meta: {
						created_at: pastDate(Math.min(cfg.ageDays, 10)),
						updated_at: new Date().toISOString(),
						author_id: argAuthor
					}
				};
				const argVoteCount = Math.floor(Math.random() * 8);
				const argVoters = pickN(users, Math.min(argVoteCount, users.length));
				for (const v of argVoters) {
					const vote: Vote = {
						user_id: v,
						type: pick(['support', 'reject', 'neutral'] as const),
						weight: 1,
						cast_at: pastDate(Math.min(cfg.ageDays, 10))
					};
					arg.votes.push(vote);
					seededVotes.push({
						target_type: 'argument',
						target_id: arg.id,
						user_id: vote.user_id,
						vote_type: vote.type,
						weight: vote.weight,
						cast_at: vote.cast_at
					});
					totalArgVotes++;
				}
				seededArguments.push(arg);
				totalArgs++;
				if (argAuthor === devUserId) myArgIds.push(arg.id);
			}

			seededTheses.push(thesis);
		}

		// Fork-back: other-authored arguments that fork the dev user's arguments.
		if (myArgIds.length > 0) {
			const otherTheses = seededTheses.filter((t) => t.meta.author_id !== devUserId);
			const forkTargets = pickN(otherTheses, Math.min(6, otherTheses.length));
			for (const t of forkTargets) {
				const sourceId = pick(myArgIds);
				const forkAuthor = pick(users.filter((u) => u !== devUserId));
				const stance: 'support' | 'reject' = Math.random() < 0.55 ? 'support' : 'reject';
				const arg: Argument = {
					id: generateId(),
					thesis_id: t.id,
					stance,
					content: pick(argTemplates[stance]),
					attributes: [{ evidence_type: pick(['logical', 'study', 'experiential', 'authority'] as const) }],
					votes: [],
					forked_from_id: sourceId,
					meta: {
						created_at: pastDate(5),
						updated_at: new Date().toISOString(),
						author_id: forkAuthor
					}
				};
				seededArguments.push(arg);
				totalArgs++;
			}
		}
	}

	// Flush everything in a single transaction. Order matters:
	// theses first (FK target for arguments), then arguments (FK target for fork sources),
	// then votes.
	const t1 = Date.now();
	withTransaction(() => {
		dbInsertThesesBulk(seededTheses);
		// Sort so fork sources are inserted before their forks (self-FK on arguments).
		const sortedArgs = [...seededArguments].sort((a, b) => {
			if (!a.forked_from_id && b.forked_from_id) return -1;
			if (a.forked_from_id && !b.forked_from_id) return 1;
			return 0;
		});
		dbInsertArgumentsBulk(sortedArgs);
		for (const v of seededVotes) {
			dbUpsertVote(v.target_type, v.target_id, v.user_id, v.vote_type, v.weight, v.cast_at);
		}
	});
	const t2 = Date.now();

	// Now run lifecycle re-evaluation for each thesis (one UPDATE each, wrapped in a tx).
	suppressLifecycleLogs = true;
	withTransaction(() => {
		for (const thesis of seededTheses) {
			reevaluateLifecycle(thesis.id, NOW);
		}
	});
	suppressLifecycleLogs = false;
	const t3 = Date.now();

	const memMB = (process.memoryUsage?.().heapUsed ?? 0) / (1024 * 1024);
	const stats2 = tierStats();
	logger.info('seed', `seeded ${seededTheses.length} theses`, {
		theses: seededTheses.length,
		arguments: totalArgs,
		thesis_votes: totalVotes,
		arg_votes: totalArgVotes,
		users: userCount
	});
	logger.info('seed', `tier distribution`, stats2);
	logger.info('seed', `timing`, {
		build_ms: t1 - t0,
		insert_ms: t2 - t1,
		lifecycle_sweep_ms: t3 - t2,
		total_ms: t3 - t0,
		heap_mb: Number(memMB.toFixed(1))
	});
}
