// Daily budgets, client-side.
//
//  - Vote budget: 62 units. Each support/reject cast costs 1 (regardless of
//    weight); pushing weight up by 1 also costs 1. Neutral votes are free.
//  - Thesis budget: 7 new theses/day.
//
// Both reset at local midnight. Reconciled from the server on demand.

const VOTE_LIMIT = 62;
const THESIS_LIMIT = 7;
const STORAGE_KEY = 'quappe_budget';

interface BudgetState {
	votes_remaining: number;
	theses_remaining: number;
	lastReset: string; // ISO date (YYYY-MM-DD)
}

function getToday(): string {
	return new Date().toISOString().split('T')[0];
}

function emptyState(): BudgetState {
	return {
		votes_remaining: VOTE_LIMIT,
		theses_remaining: THESIS_LIMIT,
		lastReset: getToday()
	};
}

function loadBudget(): BudgetState {
	if (typeof window === 'undefined') return emptyState();
	const stored = localStorage.getItem(STORAGE_KEY);
	if (!stored) return emptyState();
	try {
		const parsed = JSON.parse(stored) as Partial<BudgetState> & Record<string, unknown>;
		if (
			typeof parsed.votes_remaining !== 'number' ||
			typeof parsed.theses_remaining !== 'number' ||
			typeof parsed.lastReset !== 'string'
		) {
			return emptyState();
		}
		if (parsed.lastReset !== getToday()) return emptyState();
		return {
			votes_remaining: Math.max(0, Math.min(VOTE_LIMIT, parsed.votes_remaining)),
			theses_remaining: Math.max(0, Math.min(THESIS_LIMIT, parsed.theses_remaining)),
			lastReset: parsed.lastReset
		};
	} catch {
		return emptyState();
	}
}

function saveBudget(state: BudgetState) {
	if (typeof window === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let _budget = $state<BudgetState>(loadBudget());

function ensureToday() {
	if (_budget.lastReset !== getToday()) {
		_budget = emptyState();
		saveBudget(_budget);
	}
}

export const budgetStore = {
	// ---- Votes ----
	get votesRemaining() {
		ensureToday();
		return _budget.votes_remaining;
	},
	get votesLimit() {
		return VOTE_LIMIT;
	},
	canAffordVotes(amount = 1): boolean {
		ensureToday();
		return _budget.votes_remaining >= amount;
	},
	spendVotes(amount = 1): boolean {
		ensureToday();
		if (_budget.votes_remaining < amount) return false;
		_budget = { ..._budget, votes_remaining: _budget.votes_remaining - amount };
		saveBudget(_budget);
		return true;
	},
	refundVotes(amount = 1): void {
		ensureToday();
		_budget = {
			..._budget,
			votes_remaining: Math.min(VOTE_LIMIT, _budget.votes_remaining + amount)
		};
		saveBudget(_budget);
	},

	// ---- Theses ----
	get thesesRemaining() {
		ensureToday();
		return _budget.theses_remaining;
	},
	get thesesLimit() {
		return THESIS_LIMIT;
	},
	canCreateThesis(): boolean {
		ensureToday();
		return _budget.theses_remaining > 0;
	},
	spendThesis(): boolean {
		ensureToday();
		if (_budget.theses_remaining <= 0) return false;
		_budget = { ..._budget, theses_remaining: _budget.theses_remaining - 1 };
		saveBudget(_budget);
		return true;
	},
	refundThesis(): void {
		ensureToday();
		_budget = {
			..._budget,
			theses_remaining: Math.min(THESIS_LIMIT, _budget.theses_remaining + 1)
		};
		saveBudget(_budget);
	},

	/**
	 * Reconcile with server-side truth. `votesSpent` = count of today's
	 * support/reject casts + weight bumps; `thesesCreated` = new theses today.
	 */
	syncFromServer(votesSpent: number, thesesCreated: number): void {
		_budget = {
			votes_remaining: Math.max(0, VOTE_LIMIT - votesSpent),
			theses_remaining: Math.max(0, THESIS_LIMIT - thesesCreated),
			lastReset: getToday()
		};
		saveBudget(_budget);
	}
};
