import type { PageLoad } from './$types';
import type { Thesis } from '$lib/models/types';
import type { ActivityDay } from '$lib/stores/data';

export const load: PageLoad = async ({ fetch }) => {
	const [thesesRes, statsRes, activityRes] = await Promise.all([
		fetch('/api/theses?limit=200'),
		fetch('/api/stats'),
		fetch('/api/activity')
	]);
	const theses: Thesis[] = await thesesRes.json();
	const stats: { heat: Record<string, number>; arguments: Record<string, number> } = await statsRes.json();
	const activity: ActivityDay[] = await activityRes.json();
	return { theses, heat: stats.heat, argumentCounts: stats.arguments, activity };
};
