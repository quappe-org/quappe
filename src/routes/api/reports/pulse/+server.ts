import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCachedPulse, refreshPulseCache } from '$lib/server/pulse';

export const GET: RequestHandler = async ({ url, locals }) => {
	const locale = locals.locale;
	const force = url.searchParams.get('force') === 'true';
	if (!force) {
		const hit = getCachedPulse(locale);
		if (hit) return json({ ...hit.body, cached: true });
	}
	const body = await refreshPulseCache(locale);
	return json({ ...body, cached: false });
};
