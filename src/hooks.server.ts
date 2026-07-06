import type { Handle } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { logger } from '$lib/stores/logger';
import { warmupModel, embed, isModelWarm } from '$lib/server/embeddings';
import { seedData, getAllTheses, setThesisEmbedding, hasThesisEmbedding } from '$lib/stores/data';
import { refreshPulseCache } from '$lib/server/pulse';
import { categorizeUncategorizedArguments } from '$lib/server/argument-categorization';
import { isLlmAvailable } from '$lib/server/llm';
import { ensureUserId } from '$lib/server/identity';
import { paraglideMiddleware } from '$lib/paraglide/server';

// Start warming the embedding model in the background at server startup.
// First requests will still work via lazy load — this just speeds up the first real embed() call.
warmupModel();

// Once model is warm, embed all seed theses in the background so semantic
// search actually has candidates to work with. Without this, semantic never
// activates and users see only fulltext matches on the seed data.
async function backfillSeedEmbeddings() {
	// Poll until model is warm (warmupModel is fire-and-forget)
	while (!isModelWarm()) {
		await new Promise((r) => setTimeout(r, 200));
	}
	seedData();
	const theses = getAllTheses().filter((t) => !hasThesisEmbedding(t.id));
	if (theses.length === 0) {
		logger.info('system', 'All seed theses already embedded, skipping backfill');
		return;
	}
	logger.info('system', `Backfilling embeddings for ${theses.length} seed theses`);
	let done = 0;
	for (const t of theses) {
		try {
			const vec = await embed(`${t.title} ${t.description}`, 'passage');
			setThesisEmbedding(t.id, vec);
			done++;
			if (done % 25 === 0) {
				logger.info('system', `Embedded ${done}/${theses.length} theses`);
			}
			// Yield to the event loop so we don't starve request handling
			await new Promise((r) => setImmediate(r));
		} catch {
			// swallow — one bad thesis shouldn't kill the batch
		}
	}
	logger.info('system', `Done backfilling embeddings (${done}/${theses.length})`);
}
backfillSeedEmbeddings().catch(() => {});

// Community-Puls: refresh on startup (after embeddings are done, so stats are
// meaningful) and then every 24h. If Ollama is not running, refresh will
// return an entry with llm.ok=false — that's fine, /pulse will still render.
async function pulseLoop() {
	// Wait for the embedding backfill to have made some progress so the report
	// reflects the seed data. 3s is enough for stats aggregation to be stable.
	await new Promise((r) => setTimeout(r, 3000));
	const available = await isLlmAvailable();
	if (!available) {
		logger.info('llm', 'Ollama not reachable at startup — /pulse will show fallback until it comes up');
	}
	const day = 24 * 60 * 60 * 1000;
	// Run once immediately
	while (true) {
		try {
			const r = await refreshPulseCache();
			if (r.llm.ok) {
				logger.info('llm', 'Pulse cache refreshed', { model: r.llm.model });
			} else {
				logger.warn('llm', 'Pulse refresh: LLM unavailable', { error: r.llm.error });
			}
		} catch (err) {
			logger.warn('llm', 'Pulse refresh threw', { error: (err as Error)?.message });
		}
		await new Promise((r) => setTimeout(r, day));
	}
}
pulseLoop().catch(() => {});

// Nightly LLM batch that assigns categories to human-authored arguments that
// don't have any yet. Arguments start uncategorised on purpose: we don't want
// authors to be forced through another taxonomy picker after they already
// picked one for the thesis. This job fills the gap asynchronously.
async function argumentCategorizationLoop() {
	// Delay first run so it doesn't compete with model warmup + seed backfill.
	await new Promise((r) => setTimeout(r, 15_000));
	const day = 24 * 60 * 60 * 1000;
	while (true) {
		try {
			const n = await categorizeUncategorizedArguments();
			if (n > 0) logger.info('system', `argument categorizer: annotated ${n}`);
		} catch (err) {
			logger.warn('system', 'argument categorizer threw', { error: (err as Error)?.message });
		}
		await new Promise((r) => setTimeout(r, day));
	}
}
argumentCategorizationLoop().catch(() => {});

/**
 * Log every request that hits the server.
 * We only log API routes and page loads to keep the noise low - static assets
 * are handled by Vite and don't need logs.
 */
const MAX_BODY_BYTES = 32 * 1024; // 32 KB - well above our largest field cap

export const handle: Handle = async ({ event, resolve }) => {
	// Paraglide middleware determines the locale from the URL (or falls back to
	// cookie / Accept-Language / baseLocale) and stashes it in AsyncLocalStorage
	// so `getLocale()` and `m.*()` message calls resolve correctly during SSR.
	// SvelteKit's `reroute` hook (src/hooks.ts) handles URL delocalization for
	// us — we don't touch `event.request` here, we just let paraglide set up
	// the locale context around `resolve(event)`.
	//
	// Redirects (URL/cookie/preferredLanguage disagreement) short-circuit and
	// return a 307 without invoking the inner callback.
	return paraglideMiddleware(event.request, async ({ locale }) => {
		event.locals.locale = locale;

		const path = event.url.pathname;
		const isApi = path.startsWith('/api/');
		const isAsset = /\.(css|js|png|jpg|jpeg|svg|ico|webp|woff2?)$/i.test(path);

		// Establish (or verify) the signed-cookie identity. Every request lands
		// here with a valid `locals.user_id` — handlers never need to trust
		// user_id/author_id fields from the request body.
		if (!isAsset) {
			event.locals.user_id = ensureUserId(event.cookies);
		}

		// Hard body-size cap for API writes — first line of defence against
		// multi-MB payload floods before any handler parses JSON.
		if (isApi && event.request.method !== 'GET' && event.request.method !== 'HEAD') {
			const cl = event.request.headers.get('content-length');
			if (cl && Number(cl) > MAX_BODY_BYTES) {
				logger.warn('api', `${event.request.method} ${path} rejected: body too large`, {
					content_length: Number(cl)
				});
				return json(
					{ error: `Request body exceeds ${MAX_BODY_BYTES} bytes` },
					{ status: 413 }
				);
			}
		}

		const start = performance.now();
		let response: Response;
		try {
			response = await resolve(event, {
				transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
			});
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
	});
};
