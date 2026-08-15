// Rephrase a thesis title + description into one of three registers, on demand.
// Nothing is persisted; the client caches per session (like translate).
//
//   simple — as short and simple as possible (plain language, minimal)
//   dense  — as short and complex as possible (precise, compressed, technical)
//   prose  — some natural prose in between
//
// Returns { title, description, variant }.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getThesisById } from '$lib/stores/data';
import { generate, isLlmAvailable } from '$lib/server/llm';

const VARIANTS = new Set(['simple', 'dense', 'prose']);

const INSTRUCTION: Record<string, string> = {
	simple:
		'Rewrite the title and description as short and simple as possible. Use plain, everyday language a child could follow. Prefer the fewest words. No jargon.',
	dense:
		'Rewrite the title and description as short and information-dense as possible. Precise, technical, compressed — every word carries weight. Keep it rigorous but brief.',
	prose:
		'Rewrite the title and description as natural, flowing prose — a balanced middle register: clear and readable, neither oversimplified nor overly compressed.'
};

export const GET: RequestHandler = async ({ params, url }) => {
	const thesis = getThesisById(params.id);
	if (!thesis) throw error(404, 'Thesis not found');

	const variant = (url.searchParams.get('variant') ?? '').toLowerCase();
	if (!VARIANTS.has(variant)) throw error(400, `Unsupported variant: ${variant}`);

	if (!(await isLlmAvailable())) {
		return json({ error: 'LLM unavailable' }, { status: 503 });
	}

	const system = `You are an editor. ${INSTRUCTION[variant]} Keep the original meaning and stance intact — do not add or drop claims. Answer in the SAME language as the input. Output ONLY a compact JSON object with keys "title" and "description". No commentary.`;
	const prompt = `Title: ${thesis.title}\nDescription: ${thesis.description}`;

	const res = await generate(prompt, { system, maxTokens: 500, temperature: 0.3 });
	if (!res.ok) {
		return json({ error: res.error, hint: res.hint }, { status: 502 });
	}

	const match = res.text.match(/\{[\s\S]*\}/);
	if (!match) {
		return json({ error: 'Rephrase response was not JSON' }, { status: 502 });
	}
	try {
		const parsed = JSON.parse(match[0]) as { title?: string; description?: string };
		if (!parsed.title || !parsed.description) {
			return json({ error: 'Rephrase missing fields' }, { status: 502 });
		}
		return json({ title: parsed.title, description: parsed.description, variant });
	} catch {
		return json({ error: 'Rephrase JSON parse failed' }, { status: 502 });
	}
};
