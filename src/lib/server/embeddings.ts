// Multilingual embedding model (server-only)
// Model: Xenova/multilingual-e5-small — 120MB, 100+ languages, CPU/WASM, no GPU needed
// Lazy-loaded on first use to avoid blocking server startup.

import { env, pipeline } from '@xenova/transformers';

// Cache model files in .cache dir relative to project root so they survive restarts
env.cacheDir = './.cache/transformers';
// Disable local model checks so it always fetches from hub if not cached
env.allowLocalModels = false;

type FeatureExtractionPipeline = Awaited<ReturnType<typeof pipeline<'feature-extraction'>>>;

let _pipeline: FeatureExtractionPipeline | null = null;
let _loading: Promise<FeatureExtractionPipeline> | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
	if (_pipeline) return _pipeline;
	if (_loading) return _loading;

	_loading = pipeline('feature-extraction', 'Xenova/multilingual-e5-small', {
		quantized: true // use 8-bit quantized model (~30MB instead of 120MB)
	}) as Promise<FeatureExtractionPipeline>;

	_pipeline = await _loading;
	_loading = null;
	return _pipeline;
}

/**
 * Returns true if the model is already loaded (warm).
 * Used to skip suggestion if model isn't ready yet (avoids blocking POST response).
 */
export function isModelWarm(): boolean {
	return _pipeline !== null;
}

/**
 * Compute a normalized embedding vector for the given text.
 * role='passage' for content to be indexed, role='query' for search queries.
 * e5 models expect these prefixes for best results.
 */
export async function embed(text: string, role: 'query' | 'passage' = 'passage'): Promise<Float32Array> {
	const p = await getPipeline();
	const prefix = role === 'query' ? 'query: ' : 'passage: ';
	const output = await p(prefix + text.slice(0, 512), { pooling: 'mean', normalize: true });
	// output.data is a Float32Array
	return output.data as Float32Array;
}

/**
 * Warm up the model in the background (call once at server startup).
 * Errors are swallowed — model will be loaded lazily on first real request instead.
 */
export function warmupModel(): void {
	getPipeline().catch(() => {
		// silently ignore — lazy load will retry on first embed() call
	});
}
