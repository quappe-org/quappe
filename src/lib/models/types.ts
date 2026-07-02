// Core domain types for Quappe

export type VoteType = 'support' | 'reject' | 'neutral';

// Categories are dynamic strings - managed by admin in settings
export type Category = string;

export const DEFAULT_CATEGORIES: Category[] = [
	'education',
	'policy',
	'health',
	'family',
	'fairness',
	'environment',
	'economy',
	'technology',
	'culture',
	'other'
];

export type EvidenceType = 'emotional' | 'study' | 'authority' | 'logical' | 'experiential';

export interface Meta {
	created_at: string; // ISO timestamp
	updated_at: string; // ISO timestamp
	author_id: string; // anonymous UUID
	location?: string; // coarse-grained: country/region, never precise
}

export interface Vote {
	user_id: string;
	type: VoteType;
	weight: number; // 1 = free, additional weight costs 1 budget per point
	cast_at: string; // ISO timestamp
}

export interface VoteSummary {
	support: number; // sum of weights (not count of voters)
	reject: number;
	neutral: number;
	total: number;
	voters: number; // count of distinct users (not weight)
}

export interface ArgumentAttribute {
	evidence_type: EvidenceType;
	source_url?: string; // link to study/authority
	source_comment?: string; // description of the source
}

export type ArgumentStance = 'support' | 'reject';

// ---- Lifecycle model (thesis-level) ----
// Arguments inherit their thesis's state implicitly for now.

export type LifecycleState =
	| 'seedling' // newly created, gathering initial reactions
	| 'discussed' // healthy activity, no clear consensus yet
	| 'contested' // active but polarised (support ~ reject)
	| 'crystallized' // clear majority position + solid arguments
	| 'faded' // activity dropped, no consensus reached
	| 'dormant'; // long-inactive; kept as cold reference

export interface LifecycleInfo {
	state: LifecycleState;
	state_since: string; // ISO timestamp when the thesis entered the current state
	quality_score: number; // 0..1, higher = more valuable to surface
}

export interface Argument {
	id: string;
	thesis_id: string;
	stance: ArgumentStance; // does this argument support or reject the thesis?
	content: string; // the argument text
	attributes: ArgumentAttribute[];
	votes: Vote[];
	forked_from_id?: string; // argument this was forked from (parallel evolution)
	meta: Meta;
}

export interface Thesis {
	id: string;
	title: string;
	description: string;
	categories: Category[];
	votes: Vote[];
	related_thesis_ids: string[]; // graph edges to other Theses
	archived: boolean; // archived by admin (still visible, but de-emphasized)
	lifecycle: LifecycleInfo;
	meta: Meta;
}

// API request/response types

export interface CreateThesisRequest {
	title: string;
	description: string;
	categories: Category[];
	location?: string;
}

export interface CreateArgumentRequest {
	thesis_id: string;
	content: string;
	attributes: ArgumentAttribute[];
	stance: ArgumentStance;
	forked_from_id?: string;
}

export interface CastVoteRequest {
	user_id: string;
	type: VoteType;
}

// Complexity slider settings
export interface ComplexitySettings {
	max_theses: number; // 3 to 62
	max_arguments: number; // 1 to 7
}

export const COMPLEXITY_DEFAULTS: ComplexitySettings = {
	max_theses: 10,
	max_arguments: 5
};

export const COMPLEXITY_MIN: ComplexitySettings = {
	max_theses: 3,
	max_arguments: 3
};

export const COMPLEXITY_MAX: ComplexitySettings = {
	max_theses: 62,
	max_arguments: 7
};

// Absolute floor/ceiling that the admin can NOT go below/above
// (protects against nonsense configuration)
export const COMPLEXITY_HARD_MIN: ComplexitySettings = {
	max_theses: 3,
	max_arguments: 3
};

export const COMPLEXITY_HARD_MAX: ComplexitySettings = {
	max_theses: 200,
	max_arguments: 20
};
