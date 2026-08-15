// Readability registers for a thesis, bound to the complexity slider.
//
// The author may provide up to two extra registers besides the original:
//   - simple : as short and plain as possible
//   - dense  : as short and information-dense/precise as possible
// The original title/description IS the "prose" (middle) register.
//
// The view chooses a register from the complexity slider and falls back to the
// original whenever the chosen variant is absent. Nothing is generated at read
// time — registers are authored (or author-approved), so meaning stays the
// author's responsibility.

import type { Thesis } from './types';
import { FIB_ARGUMENTS } from './fibonacci';

export type Register = 'simple' | 'prose' | 'dense';

// Map the complexity slider (via max_arguments on the Fibonacci ladder
// 1·2·3·5·8) to a register. Lower third → simple, middle → prose, upper → dense.
export function registerForComplexity(maxArguments: number): Register {
	const ladder = FIB_ARGUMENTS; // [1,2,3,5,8]
	const idx = ladder.indexOf(maxArguments);
	const pos = idx === -1 ? ladder.length - 1 : idx; // default to top if unknown
	const third = ladder.length / 3;
	if (pos < third) return 'simple';
	if (pos < third * 2) return 'prose';
	return 'dense';
}

// Pick the best available text for a register, falling back to the original.
export function pickVariant(
	thesis: Pick<
		Thesis,
		| 'title'
		| 'description'
		| 'title_simple'
		| 'description_simple'
		| 'title_dense'
		| 'description_dense'
	> | undefined,
	register: Register,
	field: 'title' | 'description'
): string {
	if (!thesis) return '';
	if (register === 'simple') {
		const v = field === 'title' ? thesis.title_simple : thesis.description_simple;
		if (v) return v;
	} else if (register === 'dense') {
		const v = field === 'title' ? thesis.title_dense : thesis.description_dense;
		if (v) return v;
	}
	// prose / fallback → original
	return field === 'title' ? thesis.title : thesis.description;
}
