import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getHeatMap, getArgumentCounts } from '$lib/stores/data';

export const GET: RequestHandler = async () => {
	const heatMap = getHeatMap();
	const argCounts = getArgumentCounts();

	const heat: Record<string, number> = {};
	for (const [id, ratio] of heatMap) {
		heat[id] = ratio;
	}

	const argStats: Record<string, number> = {};
	for (const [id, count] of argCounts) {
		argStats[id] = count;
	}

	return json({ heat, arguments: argStats });
};
