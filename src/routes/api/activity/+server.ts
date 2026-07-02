import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getActivityCalendar } from '$lib/stores/data';

export const GET: RequestHandler = async ({ url }) => {
	const thesis_id = url.searchParams.get('thesis_id');
	const daysParam = url.searchParams.get('days');
	const days = daysParam ? parseInt(daysParam, 10) : 84;

	const data = getActivityCalendar(thesis_id, days);
	return json(data);
};
