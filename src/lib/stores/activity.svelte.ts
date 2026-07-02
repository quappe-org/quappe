// Sidebar activity store - pages can push their activity data here
// and the layout renders it in the right sidebar

import type { ActivityDay } from '$lib/stores/data';

let _activity = $state<ActivityDay[]>([]);
let _title = $state('Platform activity');

export const activityStore = {
	get data() {
		return _activity;
	},
	get title() {
		return _title;
	},
	set(activity: ActivityDay[], title = 'Platform activity') {
		_activity = activity;
		_title = title;
	},
	clear() {
		_activity = [];
		_title = 'Platform activity';
	}
};
