// Input budget system with 3 separate daily buckets
// Each bucket: 7 actions per day
// Reading and voting is always free

const DAILY_LIMIT = 7;
const STORAGE_KEY = 'quappe_budget';

export type BudgetKind = 'thesis' | 'support' | 'reject';

interface BudgetState {
	thesis: number;
	support: number;
	reject: number;
	lastReset: string; // ISO date (YYYY-MM-DD)
}

function getToday(): string {
	return new Date().toISOString().split('T')[0];
}

function emptyState(): BudgetState {
	return {
		thesis: DAILY_LIMIT,
		support: DAILY_LIMIT,
		reject: DAILY_LIMIT,
		lastReset: getToday()
	};
}

function loadBudget(): BudgetState {
	if (typeof window === 'undefined') return emptyState();
	const stored = localStorage.getItem(STORAGE_KEY);
	if (!stored) return emptyState();
	try {
		const state: BudgetState = JSON.parse(stored);
		if (state.lastReset !== getToday()) return emptyState();
		// Migration: ensure all fields exist
		return {
			thesis: state.thesis ?? DAILY_LIMIT,
			support: state.support ?? DAILY_LIMIT,
			reject: state.reject ?? DAILY_LIMIT,
			lastReset: state.lastReset
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
	get thesis() {
		ensureToday();
		return _budget.thesis;
	},
	get support() {
		ensureToday();
		return _budget.support;
	},
	get reject() {
		ensureToday();
		return _budget.reject;
	},
	get limit() {
		return DAILY_LIMIT;
	},
	canCreate(kind: BudgetKind): boolean {
		ensureToday();
		return _budget[kind] > 0;
	},
	canAfford(kind: BudgetKind, amount: number): boolean {
		ensureToday();
		return _budget[kind] >= amount;
	},
	spend(kind: BudgetKind, amount = 1): boolean {
		ensureToday();
		if (_budget[kind] < amount) return false;
		_budget = { ..._budget, [kind]: _budget[kind] - amount };
		saveBudget(_budget);
		return true;
	},
	refund(kind: BudgetKind, amount = 1): void {
		ensureToday();
		_budget = { ..._budget, [kind]: Math.min(DAILY_LIMIT, _budget[kind] + amount) };
		saveBudget(_budget);
	}
};
