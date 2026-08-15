// Fibonacci is the spine of Quappe's "natural limits" story.
// The idea: discrete, felt steps that help people focus instead of a diffuse
// linear continuum. Fibonacci grows gently at first, then accelerates — which
// mirrors how attention and effort scale. Both the complexity slider and the
// vote-weight cycle draw their steps from here so the whole product speaks one
// numeric language.

// Canonical sequence used across the product. Starts at 1.
// 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233 ...
export const FIB: readonly number[] = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233];

// Complexity slider steps for the "how many items to show" dimension.
// max_theses ranges over a wider band; arguments/related over a tighter one.
export const FIB_THESES: readonly number[] = [3, 5, 8, 13, 21, 34, 55];
export const FIB_ARGUMENTS: readonly number[] = [1, 2, 3, 5, 8];
export const FIB_RELATED: readonly number[] = [3, 5, 8, 13];

// Vote-weight cycle. A strong opinion costs disproportionately more (Fibonacci
// growth), which naturally dampens weight-stacking abuse.
export const FIB_WEIGHTS: readonly number[] = [1, 2, 3, 5, 8];

// Snap an arbitrary number to the nearest Fibonacci value in a given ladder.
export function snapToFib(value: number, ladder: readonly number[] = FIB): number {
	if (ladder.length === 0) return value;
	let best = ladder[0];
	let bestDist = Math.abs(value - best);
	for (const f of ladder) {
		const d = Math.abs(value - f);
		if (d < bestDist) {
			best = f;
			bestDist = d;
		}
	}
	return best;
}

// Given a current weight, return the next weight in the Fibonacci cycle.
// Cycles up the ladder, then wraps back to the first step (a free retract).
export function nextFibWeight(current: number, ladder: readonly number[] = FIB_WEIGHTS): number {
	const idx = ladder.indexOf(current);
	if (idx === -1) return ladder[0];
	if (idx >= ladder.length - 1) return ladder[0]; // wrap → reset
	return ladder[idx + 1];
}

// Largest allowed vote weight (last step of the weight ladder).
export const MAX_VOTE_WEIGHT = FIB_WEIGHTS[FIB_WEIGHTS.length - 1]; // 8

// Server-side normalisation: clamp an incoming weight into [1, MAX] and snap it
// to the nearest legal Fibonacci weight so only ladder values ever persist.
export function normalizeVoteWeight(weight: unknown): number {
	const n = typeof weight === 'number' && Number.isFinite(weight) ? Math.floor(weight) : 1;
	const clamped = Math.max(1, Math.min(MAX_VOTE_WEIGHT, n));
	return snapToFib(clamped, FIB_WEIGHTS);
}

