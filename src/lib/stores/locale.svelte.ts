import { getLocale, type Locale } from '$lib/paraglide/runtime';

// Reactive wrapper around Paraglide's getLocale(). getLocale() is a plain
// function — Svelte can't track it as a dependency inside $derived.by. This
// store exposes `current` as a $state field that gets refreshed on client-
// side navigation (see +layout.svelte) and after setLocale() in settings.
class LocaleStore {
	current = $state<Locale | null>(null);

	refresh() {
		if (typeof window === 'undefined') return;
		try {
			this.current = getLocale() as Locale;
		} catch {
			// getLocale() throws if no strategy has resolved yet — leave current as-is.
		}
	}
}

export const localeStore = new LocaleStore();
