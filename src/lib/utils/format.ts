// Small formatting helpers used across the UI.

/**
 * Abbreviate large numbers K / M / B style.
 * < 10000 stays as-is. Values >= 10000 get a suffix and 1 decimal.
 * Negative and zero handled cleanly.
 */
export function abbreviateNumber(n: number): string {
	const abs = Math.abs(n);
	if (abs < 10_000) return String(n);
	const sign = n < 0 ? '-' : '';
	if (abs < 1_000_000) return `${sign}${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
	if (abs < 1_000_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
	return `${sign}${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
}

/** Same but includes an explicit +/- sign in front. Used for vote deltas. */
export function abbreviateSigned(n: number, sign: '+' | '-' | '~' = '+'): string {
	return `${sign}${abbreviateNumber(Math.abs(n))}`;
}
