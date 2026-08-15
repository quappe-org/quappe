// User's chosen color theme. Applied by setting `data-theme` on <html>.
// Aesthetic palettes only — accessibility modes (calm/contrast/reduced-motion)
// are orthogonal and live in a11y.svelte.ts. Persisted in localStorage.

export type Theme = 'rainbow' | 'pastel' | 'grayscale' | 'classic' | 'unicorn';

const KEY = 'quappe_theme';
const VALID: readonly Theme[] = ['rainbow', 'pastel', 'grayscale', 'classic', 'unicorn'] as const;

function loadTheme(): Theme {
	if (typeof window === 'undefined') return 'rainbow';
	const raw = localStorage.getItem(KEY);
	return (VALID as readonly string[]).includes(raw ?? '') ? (raw as Theme) : 'rainbow';
}

function applyTheme(t: Theme): void {
	if (typeof document === 'undefined') return;
	if (t === 'rainbow') document.documentElement.removeAttribute('data-theme');
	else document.documentElement.setAttribute('data-theme', t);
}

class ThemeStore {
	current = $state<Theme>(loadTheme());

	init(): void {
		applyTheme(this.current);
	}

	set(t: Theme): void {
		this.current = t;
		if (typeof window !== 'undefined') localStorage.setItem(KEY, t);
		applyTheme(t);
	}
}

export const themeStore = new ThemeStore();
