// Global complexity store using Svelte 5 runes
// Shared state accessible from any component

import { COMPLEXITY_DEFAULTS, type ComplexitySettings } from '$lib/models/types';

let _settings = $state<ComplexitySettings>(COMPLEXITY_DEFAULTS);

export const complexityStore = {
	get settings() {
		return _settings;
	},
	set(s: ComplexitySettings) {
		_settings = s;
	}
};
