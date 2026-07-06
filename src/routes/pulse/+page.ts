import type { PageLoad } from './$types';
import type { ActivityDay } from '$lib/stores/data';

export const load: PageLoad = async ({ fetch }) => {
	const [pulseRes, activityRes] = await Promise.all([
		fetch('/api/reports/pulse'),
		fetch('/api/activity')
	]);
	const activity: ActivityDay[] = activityRes.ok ? await activityRes.json() : [];
	if (!pulseRes.ok) {
		return { pulse: null, error: `Server antwortete ${pulseRes.status}`, activity };
	}
	return { pulse: await pulseRes.json(), error: null, activity };
};
