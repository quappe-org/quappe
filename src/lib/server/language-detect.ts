// LLM-based language detection for thesis title + description.
// Returns a 2-letter ISO code from our supported locales, or 'en' as fallback.

import { generate, isLlmAvailable } from '$lib/server/llm';
import { logger } from '$lib/stores/logger';

const SUPPORTED = ['en', 'de', 'fr', 'es'] as const;
type Supported = typeof SUPPORTED[number];

const SYSTEM = `You are a language detector. Given a short text, respond with exactly ONE of these codes and nothing else: en, de, fr, es. If unsure, respond "en".`;

export async function detectLanguage(text: string): Promise<Supported> {
	// Skip if LLM not reachable — caller can retry via nightly backfill.
	if (!(await isLlmAvailable())) return 'en';

	const snippet = text.slice(0, 400);
	const res = await generate(`Text:\n${snippet}\n\nAnswer:`, {
		system: SYSTEM,
		maxTokens: 4,
		temperature: 0
	});

	if (!res.ok) {
		logger.warn('llm', 'language-detect failed', { error: res.error });
		return 'en';
	}

	const raw = res.text.trim().toLowerCase().slice(0, 2);
	if ((SUPPORTED as readonly string[]).includes(raw)) return raw as Supported;
	logger.info('llm', 'language-detect unclear', { raw: res.text.slice(0, 20) });
	return 'en';
}
