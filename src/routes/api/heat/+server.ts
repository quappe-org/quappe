import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getHeatMap } from '$lib/stores/data';

export const GET: RequestHandler = async () => {
	const heatMap = getHeatMap();
	// Convert Map to plain object for JSON
	const heat: Record<string, number> = {};
	for (const [id, ratio] of heatMap) {
		heat[id] = ratio;
	}
	return json(heat);
};
