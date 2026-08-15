// Accessibility modes — orthogonal to the aesthetic theme (they combine with
// any palette, like invert). Applied as data-attributes on <html>:
//   data-calm="true"      — reduced visual noise: flatter, fewer shadows, calmer
//   data-contrast="true"  — higher text/border contrast
//   data-reduced-motion="true" — disables non-essential animation/transition
//
// Named by FUNCTION, not by diagnosis — inclusive, not labelling. "Calm" helps
// anyone who finds a busy UI distracting (ADHD, autism, migraine, or just a
// noisy environment). Persisted in localStorage.

const KEY = 'quappe_a11y';

export type A11yMode = 'calm' | 'contrast' | 'reducedMotion';

interface A11yState {
	calm: boolean;
	contrast: boolean;
	reducedMotion: boolean;
}

function empty(): A11yState {
	return { calm: false, contrast: false, reducedMotion: false };
}

function load(): A11yState {
	if (typeof window === 'undefined') return empty();
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return empty();
		const p = JSON.parse(raw) as Partial<A11yState>;
		return {
			calm: !!p.calm,
			contrast: !!p.contrast,
			reducedMotion: !!p.reducedMotion
		};
	} catch {
		return empty();
	}
}

const ATTR: Record<A11yMode, string> = {
	calm: 'data-calm',
	contrast: 'data-contrast',
	reducedMotion: 'data-reduced-motion'
};

function apply(state: A11yState): void {
	if (typeof document === 'undefined') return;
	const el = document.documentElement;
	for (const mode of ['calm', 'contrast', 'reducedMotion'] as A11yMode[]) {
		if (state[mode]) el.setAttribute(ATTR[mode], 'true');
		else el.removeAttribute(ATTR[mode]);
	}
}

class A11yStore {
	state = $state<A11yState>(load());

	init(): void {
		apply(this.state);
	}

	toggle(mode: A11yMode): void {
		this.state = { ...this.state, [mode]: !this.state[mode] };
		if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(this.state));
		apply(this.state);
	}

	is(mode: A11yMode): boolean {
		return this.state[mode];
	}
}

export const a11yStore = new A11yStore();
