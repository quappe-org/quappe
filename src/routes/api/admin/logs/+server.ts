import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tailLogs, logStats, clearLogs, type LogLevel } from '$lib/stores/logger';
import { tierStats } from '$lib/stores/data';

/**
 * GET  /api/admin/logs?since=<seq>&limit=<n>&level=<lvl>&source=<src>
 * Returns log entries newer than `since` (default 0 = all buffered).
 *
 * DELETE clears the buffer.
 */
export const GET: RequestHandler = async ({ url }) => {
	const since = Number(url.searchParams.get('since') ?? '0');
	const limit = Math.min(2000, Number(url.searchParams.get('limit') ?? '500'));
	const level = url.searchParams.get('level') as LogLevel | null;
	const source = url.searchParams.get('source');

	let entries = tailLogs(limit, since);
	if (level) entries = entries.filter((e) => e.level === level);
	if (source) entries = entries.filter((e) => e.source === source);

	return json({
		entries,
		stats: logStats(),
		tiers: tierStats()
	});
};

export const DELETE: RequestHandler = async () => {
	clearLogs();
	return json({ ok: true });
};
