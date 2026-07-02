// UI intent signals - one-shot triggers between components
// Used e.g. to open the "new thesis" form from sidebar

let _openNewThesis = $state(false);

export const uiIntents = {
	get openNewThesis() {
		return _openNewThesis;
	},
	requestNewThesis() {
		_openNewThesis = true;
	},
	consumeNewThesis() {
		_openNewThesis = false;
	}
};
