import type { Handle } from '@sveltejs/kit';
import { logger } from '$lib/stores/logger';

/**
 * Log every request that hits the server.
 * We only log API routes and page loads to keep the noise low - static assets
 * are handled by Vite and don't need logs.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const isApi = path.startsWith('/api/');
	const isAsset = /\.(css|js|png|jpg|jpeg|svg|ico|webp|woff2?)$/i.test(path);

	const start = performance.now();
	let response: Response;
	try {
		response = await resolve(event);
	} catch (err) {
		const duration = performance.now() - start;
		logger.error('api', `${event.request.method} ${path} threw`, {
			duration_ms: Math.round(duration),
			error: (err as Error)?.message ?? String(err)
		});
		throw err;
	}
	const duration = performance.now() - start;

	// Skip asset chatter
	if (isAsset) return response;

	const level = response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info';
	const meta: Record<string, unknown> = {
		method: event.request.method,
		status: response.status,
		duration_ms: Math.round(duration * 10) / 10
	};

	// Add query string for API GETs (helps understanding trending/top/limit)
	if (isApi && event.url.search) {
		meta.query = event.url.search;
	}

	logger[level](isApi ? 'api' : 'system', `${event.request.method} ${path}`, meta);

	return response;
};
