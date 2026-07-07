// Independent inversion toggle. Not a theme — orthogonal to rainbow/pastel/
// grayscale. Applies `filter: invert(1) hue-rotate(180deg)` to <html> so
// colors flip without touching any CSS variable. Persisted in localStorage.

const KEY = 'quappe_invert';

function loadInvert(): boolean {
	if (typeof window === 'undefined') return false;
	return localStorage.getItem(KEY) === '1';
}

function apply(on: boolean): void {
	if (typeof document === 'undefined') return;
	if (on) document.documentElement.setAttribute('data-invert', 'true');
	else document.documentElement.removeAttribute('data-invert');
}

class InvertStore {
	on = $state<boolean>(loadInvert());

	init(): void {
		apply(this.on);
	}

	toggle(): void {
		this.set(!this.on);
	}

	set(on: boolean): void {
		this.on = on;
		if (typeof window !== 'undefined') localStorage.setItem(KEY, on ? '1' : '0');
		apply(on);
	}
}

export const invertStore = new InvertStore();
