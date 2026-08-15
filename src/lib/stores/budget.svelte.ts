// Daily budgets — client-side optimistic mirror. The SERVER is the authority
// (src/lib/server/budget.ts enforces every write); this store just gives the
// UI instant feedback and is reconciled via syncFromServer() on load + writes.
//
// Model (Fibonacci-flavoured), reset at local midnight:
//   - theses:        8/day
//   - support args:  8/day
//   - reject args:   8/day
//   - weight points: 21/day  (base weight-1 votes are FREE; only extra weight costs)

const THESIS_LIMIT = 8;
const SUPPORT_ARG_LIMIT = 8;
const REJECT_ARG_LIMIT = 8;
const WEIGHT_LIMIT = 21;
const STORAGE_KEY = 'quappe_budget';

interface BudgetState {
	weight_remaining: number;
	theses_remaining: number;
	support_args_remaining: number;
	reject_args_remaining: number;
	lastReset: string; // ISO date (YYYY-MM-DD)
}

function getToday(): string {
	return new Date().toISOString().split('T')[0];
}

function emptyState(): BudgetState {
	return {
		weight_remaining: WEIGHT_LIMIT,
		theses_remaining: THESIS_LIMIT,
		support_args_remaining: SUPPORT_ARG_LIMIT,
		reject_args_remaining: REJECT_ARG_LIMIT,
		lastReset: getToday()
	};
}

function loadBudget(): BudgetState {
	if (typeof window === 'undefined') return emptyState();
	const stored = localStorage.getItem(STORAGE_KEY);
	if (!stored) return emptyState();
	try {
		const p = JSON.parse(stored) as Partial<BudgetState>;
		if (typeof p.lastReset !== 'string' || p.lastReset !== getToday()) return emptyState();
		return {
			weight_remaining: clamp(p.weight_remaining, WEIGHT_LIMIT),
			theses_remaining: clamp(p.theses_remaining, THESIS_LIMIT),
			support_args_remaining: clamp(p.support_args_remaining, SUPPORT_ARG_LIMIT),
			reject_args_remaining: clamp(p.reject_args_remaining, REJECT_ARG_LIMIT),
			lastReset: p.lastReset
		};
	} catch {
		return emptyState();
	}
}

function clamp(v: unknown, max: number): number {
	if (typeof v !== 'number' || !Number.isFinite(v)) return max;
	return Math.max(0, Math.min(max, v));
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
	// ---- Vote weight pool (base votes are free) ----
	get weightRemaining() {
		ensureToday();
		return _budget.weight_remaining;
	},
	get weightLimit() {
		return WEIGHT_LIMIT;
	},
	// A vote of `weight` costs (weight - 1) points; base weight-1 is free.
	weightCost(weight: number): number {
		return Math.max(0, weight - 1);
	},
	canAffordWeight(weight: number): boolean {
		ensureToday();
		return _budget.weight_remaining >= this.weightCost(weight);
	},
	spendWeight(weight: number): boolean {
		ensureToday();
		const cost = this.weightCost(weight);
		if (_budget.weight_remaining < cost) return false;
		_budget = { ..._budget, weight_remaining: _budget.weight_remaining - cost };
		saveBudget(_budget);
		return true;
	},
	refundWeight(weight: number): void {
		ensureToday();
		const cost = this.weightCost(weight);
		_budget = {
			..._budget,
			weight_remaining: Math.min(WEIGHT_LIMIT, _budget.weight_remaining + cost)
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

	// ---- Arguments (per stance) ----
	get supportArgsRemaining() {
		ensureToday();
		return _budget.support_args_remaining;
	},
	get rejectArgsRemaining() {
		ensureToday();
		return _budget.reject_args_remaining;
	},
	get argsLimit() {
		return SUPPORT_ARG_LIMIT;
	},
	canCreateArgument(stance: 'support' | 'reject'): boolean {
		ensureToday();
		return stance === 'support'
			? _budget.support_args_remaining > 0
			: _budget.reject_args_remaining > 0;
	},
	spendArgument(stance: 'support' | 'reject'): boolean {
		ensureToday();
		if (stance === 'support') {
			if (_budget.support_args_remaining <= 0) return false;
			_budget = { ..._budget, support_args_remaining: _budget.support_args_remaining - 1 };
		} else {
			if (_budget.reject_args_remaining <= 0) return false;
			_budget = { ..._budget, reject_args_remaining: _budget.reject_args_remaining - 1 };
		}
		saveBudget(_budget);
		return true;
	},
	refundArgument(stance: 'support' | 'reject'): void {
		ensureToday();
		if (stance === 'support') {
			_budget = {
				..._budget,
				support_args_remaining: Math.min(SUPPORT_ARG_LIMIT, _budget.support_args_remaining + 1)
			};
		} else {
			_budget = {
				..._budget,
				reject_args_remaining: Math.min(REJECT_ARG_LIMIT, _budget.reject_args_remaining + 1)
			};
		}
		saveBudget(_budget);
	},

	/**
	 * Reconcile with server-side truth. Values are "spent today" counts.
	 */
	syncFromServer(status: {
		weight_points?: { spent: number };
		theses?: { spent: number };
		support_args?: { spent: number };
		reject_args?: { spent: number };
	}): void {
		_budget = {
			weight_remaining: Math.max(0, WEIGHT_LIMIT - (status.weight_points?.spent ?? 0)),
			theses_remaining: Math.max(0, THESIS_LIMIT - (status.theses?.spent ?? 0)),
			support_args_remaining: Math.max(0, SUPPORT_ARG_LIMIT - (status.support_args?.spent ?? 0)),
			reject_args_remaining: Math.max(0, REJECT_ARG_LIMIT - (status.reject_args?.spent ?? 0)),
			lastReset: getToday()
		};
		saveBudget(_budget);
	}
};
