// Persisted complexity slider bounds. Admin can adjust in Settings.

import type { ComplexitySettings } from '$lib/models/types';
import {
	COMPLEXITY_MIN,
	COMPLEXITY_MAX,
	COMPLEXITY_HARD_MIN,
	COMPLEXITY_HARD_MAX
} from '$lib/models/types';

const STORAGE_KEY = 'quappe_complexity_bounds';

interface Bounds {
	min: ComplexitySettings;
	max: ComplexitySettings;
}

function load(): Bounds {
	if (typeof window === 'undefined') return { min: COMPLEXITY_MIN, max: COMPLEXITY_MAX };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { min: COMPLEXITY_MIN, max: COMPLEXITY_MAX };
		const parsed = JSON.parse(raw) as Bounds;
		return parsed;
	} catch {
		return { min: COMPLEXITY_MIN, max: COMPLEXITY_MAX };
	}
}

function save(b: Bounds) {
	if (typeof window === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
}

function clamp(v: number, lo: number, hi: number) {
	return Math.max(lo, Math.min(hi, v));
}

let _bounds = $state<Bounds>(load());

export const complexityBoundsStore = {
	get min() {
		return _bounds.min;
	},
	get max() {
		return _bounds.max;
	},
	get hardMin() {
		return COMPLEXITY_HARD_MIN;
	},
	get hardMax() {
		return COMPLEXITY_HARD_MAX;
	},
	setMin(patch: Partial<ComplexitySettings>) {
		const next: ComplexitySettings = {
			max_theses: clamp(
				patch.max_theses ?? _bounds.min.max_theses,
				COMPLEXITY_HARD_MIN.max_theses,
				_bounds.max.max_theses
			),
			max_arguments: clamp(
				patch.max_arguments ?? _bounds.min.max_arguments,
				COMPLEXITY_HARD_MIN.max_arguments,
				_bounds.max.max_arguments
			)
		};
		_bounds = { ..._bounds, min: next };
		save(_bounds);
	},
	setMax(patch: Partial<ComplexitySettings>) {
		const next: ComplexitySettings = {
			max_theses: clamp(
				patch.max_theses ?? _bounds.max.max_theses,
				_bounds.min.max_theses,
				COMPLEXITY_HARD_MAX.max_theses
			),
			max_arguments: clamp(
				patch.max_arguments ?? _bounds.max.max_arguments,
				_bounds.min.max_arguments,
				COMPLEXITY_HARD_MAX.max_arguments
			)
		};
		_bounds = { ..._bounds, max: next };
		save(_bounds);
	},
	reset() {
		_bounds = { min: COMPLEXITY_MIN, max: COMPLEXITY_MAX };
		save(_bounds);
	}
};
