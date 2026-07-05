// UI intent signals - one-shot triggers between components
// Uses a counter so every click triggers the effect, even repeated clicks.

let _openNewThesisCount = $state(0);

export const uiIntents = {
	get openNewThesis() {
		return _openNewThesisCount;
	},
	requestNewThesis() {
		_openNewThesisCount++;
	},
	consumeNewThesis() {
		// no-op kept for compatibility — counter approach doesn't need consuming
	}
};
