// Translate a thesis title + description to a target locale on demand.
// Returns { title, description, target } — nothing is persisted; the client
// caches per session.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getThesisById } from '$lib/stores/data';
import { generate, isLlmAvailable } from '$lib/server/llm';

const SUPPORTED = new Set(['en', 'de', 'fr', 'es']);
const LANG_NAME: Record<string, string> = {
	en: 'English',
	de: 'German',
	fr: 'French',
	es: 'Spanish'
};

export const GET: RequestHandler = async ({ params, url }) => {
	const thesis = getThesisById(params.id);
	if (!thesis) throw error(404, 'Thesis not found');

	const to = (url.searchParams.get('to') ?? '').toLowerCase();
	if (!SUPPORTED.has(to)) throw error(400, `Unsupported target: ${to}`);

	if (!(await isLlmAvailable())) {
		return json({ error: 'LLM unavailable' }, { status: 503 });
	}

	const targetName = LANG_NAME[to];
	const system = `You are a translator. Translate the given title and description to ${targetName}. Output ONLY a compact JSON object with keys "title" and "description". Do not add commentary.`;
	const prompt = `Title: ${thesis.title}\nDescription: ${thesis.description}`;

	const res = await generate(prompt, { system, maxTokens: 400, temperature: 0.2 });
	if (!res.ok) {
		return json({ error: res.error, hint: res.hint }, { status: 502 });
	}

	// Extract the first JSON object from the model output — be permissive
	// about surrounding whitespace or fence markers.
	const match = res.text.match(/\{[\s\S]*\}/);
	if (!match) {
		return json({ error: 'Translation response was not JSON' }, { status: 502 });
	}
	try {
		const parsed = JSON.parse(match[0]) as { title?: string; description?: string };
		if (!parsed.title || !parsed.description) {
			return json({ error: 'Translation missing fields' }, { status: 502 });
		}
		return json({ title: parsed.title, description: parsed.description, target: to });
	} catch {
		return json({ error: 'Translation JSON parse failed' }, { status: 502 });
	}
};
