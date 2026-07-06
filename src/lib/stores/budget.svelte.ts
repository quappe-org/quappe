// Unified daily budget: single bucket of 62 units.
// Only *extra vote weight* (weight > 1) draws from it.
// Creating theses / arguments and casting weight-1 votes are always free.

const DAILY_LIMIT = 62;
const STORAGE_KEY = 'quappe_budget';

interface BudgetState {
	remaining: number;
	lastReset: string; // ISO date (YYYY-MM-DD)
}

function getToday(): string {
	return new Date().toISOString().split('T')[0];
}

function emptyState(): BudgetState {
	return { remaining: DAILY_LIMIT, lastReset: getToday() };
}

function loadBudget(): BudgetState {
	if (typeof window === 'undefined') return emptyState();
	const stored = localStorage.getItem(STORAGE_KEY);
	if (!stored) return emptyState();
	try {
		const parsed = JSON.parse(stored) as Partial<BudgetState> & Record<string, unknown>;
		// Migration: legacy shape had thesis/support/reject buckets. Discard.
		if (typeof parsed.remaining !== 'number' || typeof parsed.lastReset !== 'string') {
			return emptyState();
		}
		if (parsed.lastReset !== getToday()) return emptyState();
		return {
			remaining: Math.max(0, Math.min(DAILY_LIMIT, parsed.remaining)),
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
	get remaining() {
		ensureToday();
		return _budget.remaining;
	},
	get limit() {
		return DAILY_LIMIT;
	},
	canAfford(amount: number): boolean {
		ensureToday();
		return _budget.remaining >= amount;
	},
	spend(amount = 1): boolean {
		ensureToday();
		if (_budget.remaining < amount) return false;
		_budget = { ..._budget, remaining: _budget.remaining - amount };
		saveBudget(_budget);
		return true;
	},
	refund(amount = 1): void {
		ensureToday();
		_budget = {
			..._budget,
			remaining: Math.min(DAILY_LIMIT, _budget.remaining + amount)
		};
		saveBudget(_budget);
	},
	/**
	 * Reconcile with server-side truth. The server sums today's extra weight
	 * (weight - 1) across all support/reject votes; that's the only thing that
	 * costs budget now. Call on app mount to prevent localStorage drift.
	 */
	syncFromServer(spent: number): void {
		_budget = {
			remaining: Math.max(0, DAILY_LIMIT - spent),
			lastReset: getToday()
		};
		saveBudget(_budget);
	}
};
