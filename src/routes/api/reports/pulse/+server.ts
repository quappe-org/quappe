import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCachedPulse, refreshPulseCache } from '$lib/server/pulse';

export const GET: RequestHandler = async ({ url }) => {
	const force = url.searchParams.get('force') === 'true';
	if (!force) {
		const hit = getCachedPulse();
		if (hit) return json({ ...hit.body, cached: true });
	}
	const body = await refreshPulseCache();
	return json({ ...body, cached: false });
};
