import type { PageLoad } from './$types';
import type { Thesis, Argument, VoteSummary } from '$lib/models/types';
import type { ActivityDay } from '$lib/stores/data';

export interface RelatedThesis {
	thesis: Thesis;
	score: number;
}

export const load: PageLoad = async ({ params, fetch }) => {
	const [thesisRes, argumentsRes, activityRes, relatedRes] = await Promise.all([
		fetch(`/api/theses/${params.id}`),
		fetch(`/api/arguments?thesis_id=${params.id}`),
		fetch(`/api/activity?thesis_id=${params.id}`),
		fetch(`/api/theses/${params.id}/related?limit=7`)
	]);

	if (!thesisRes.ok) {
		return {
			thesis: null,
			arguments: [],
			voteSummary: null,
			activity: [] as ActivityDay[],
			related: [] as RelatedThesis[],
			relatedMode: null as string | null
		};
	}

	const thesisData = await thesisRes.json();
	const args: Argument[] = await argumentsRes.json();
	const activity: ActivityDay[] = activityRes.ok ? await activityRes.json() : [];
	let related: RelatedThesis[] = [];
	let relatedMode: string | null = null;
	if (relatedRes.ok) {
		const rel = await relatedRes.json();
		related = rel.results ?? [];
		relatedMode = rel.mode ?? null;
	}

	const thesis: Thesis = thesisData;
	const voteSummary: VoteSummary = thesisData.vote_summary;

	return { thesis, arguments: args, voteSummary, activity, related, relatedMode };
};
