// Ollama LLM client — server-only.
// Talks to a local Ollama HTTP server (default http://127.0.0.1:11434).
// Falls back gracefully with a structured error object if Ollama is unreachable.
//
// Env:
//   OLLAMA_URL     — base URL, default http://127.0.0.1:11434
//   OLLAMA_MODEL   — model tag, default llama3.1:8b
//   OLLAMA_TIMEOUT — ms, default 60000

import { logger } from '$lib/stores/logger';

const DEFAULT_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'llama3.1:8b';
const DEFAULT_TIMEOUT_MS = 60000;

export interface LlmSuccess {
	ok: true;
	text: string;
	model: string;
	duration_ms: number;
}

export interface LlmFailure {
	ok: false;
	error: string;
	hint?: string;
}

export type LlmResult = LlmSuccess | LlmFailure;

function config() {
	return {
		url: process.env.OLLAMA_URL || DEFAULT_URL,
		model: process.env.OLLAMA_MODEL || DEFAULT_MODEL,
		timeoutMs: Number(process.env.OLLAMA_TIMEOUT || DEFAULT_TIMEOUT_MS)
	};
}

/**
 * Best-effort probe. Returns true if Ollama's /api/version answers.
 * Never throws.
 */
export async function isLlmAvailable(): Promise<boolean> {
	const { url } = config();
	const ac = new AbortController();
	const t = setTimeout(() => ac.abort(), 2000);
	try {
		const res = await fetch(`${url}/api/version`, { signal: ac.signal });
		return res.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(t);
	}
}

/**
 * Generate a completion from Ollama.
 * Returns a structured result — callers should switch on `.ok` and never assume success.
 */
export async function generate(
	prompt: string,
	options: { system?: string; maxTokens?: number; temperature?: number } = {}
): Promise<LlmResult> {
	const { url, model, timeoutMs } = config();
	const start = Date.now();

	const ac = new AbortController();
	const t = setTimeout(() => ac.abort(), timeoutMs);

	try {
		const res = await fetch(`${url}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				prompt,
				system: options.system,
				stream: false,
				options: {
					temperature: options.temperature ?? 0.4,
					num_predict: options.maxTokens ?? 800
				}
			}),
			signal: ac.signal
		});

		if (!res.ok) {
			const body = await res.text().catch(() => '');
			logger.warn('llm', `Ollama returned ${res.status}`, { body: body.slice(0, 200) });
			return {
				ok: false,
				error: `Ollama responded ${res.status}`,
				hint: body.includes('model') ? `Ist das Modell "${model}" per "ollama pull ${model}" installiert?` : undefined
			};
		}

		const data = (await res.json()) as { response?: string };
		const text = (data.response ?? '').trim();
		if (!text) {
			return { ok: false, error: 'Empty response from LLM' };
		}
		const duration_ms = Date.now() - start;
		logger.info('llm', 'generate ok', { model, duration_ms, chars: text.length });
		return { ok: true, text, model, duration_ms };
	} catch (err) {
		const msg = (err as Error)?.message ?? String(err);
		const isAbort = (err as Error)?.name === 'AbortError';
		logger.warn('llm', `generate failed: ${msg}`);
		return {
			ok: false,
			error: isAbort ? `LLM timed out after ${timeoutMs}ms` : msg,
			hint: msg.includes('ECONNREFUSED')
				? `Ollama is not running at ${url}. Start "ollama serve" and "ollama pull ${model}".`
				: undefined
		};
	} finally {
		clearTimeout(t);
	}
}
