import type { PageLoad } from './$types';
import type { Thesis, Argument, VoteSummary } from '$lib/models/types';
import type { ActivityDay } from '$lib/stores/data';

export const load: PageLoad = async ({ params, fetch }) => {
	const [thesisRes, argumentsRes, activityRes] = await Promise.all([
		fetch(`/api/theses/${params.id}`),
		fetch(`/api/arguments?thesis_id=${params.id}`),
		fetch(`/api/activity?thesis_id=${params.id}`)
	]);

	if (!thesisRes.ok) {
		return { thesis: null, arguments: [], voteSummary: null, activity: [] as ActivityDay[] };
	}

	const thesisData = await thesisRes.json();
	const args: Argument[] = await argumentsRes.json();
	const activity: ActivityDay[] = activityRes.ok ? await activityRes.json() : [];

	const thesis: Thesis = thesisData;
	const voteSummary: VoteSummary = thesisData.vote_summary;

	return { thesis, arguments: args, voteSummary, activity };
};
