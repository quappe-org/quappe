// Draft a readability variant from raw title/description in the create form.
// Author tooling only: the result pre-fills a field the author then reviews and
// approves before saving. Registers are author-owned — never generated at read
// time, so meaning stays the author's responsibility.
//
//   simple — as short and simple as possible (plain language, minimal)
//   dense  — as short and information-dense as possible (precise, compressed)

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generate, isLlmAvailable } from '$lib/server/llm';
import { checkLength, checkRate, getClientIp } from '$lib/server/limits';

const INSTRUCTION: Record<string, string> = {
	simple:
		'Rewrite the title and description as short and simple as possible. Use plain, everyday language a child could follow. Prefer the fewest words. No jargon.',
	dense:
		'Rewrite the title and description as short and information-dense as possible. Precise, technical, compressed — every word carries weight. Keep it rigorous but brief.'
};

export const POST: RequestHandler = async ({ request, getClientAddress, locals }) => {
	const ip = getClientIp(request, getClientAddress());
	const rate = checkRate(ip, locals.user_id, 'write_heavy');
	if (rate) return rate;

	const body = await request.json();
	const { title, description, variant } = body as {
		title?: string;
		description?: string;
		variant?: string;
	};

	if (!variant || !(variant in INSTRUCTION)) {
		return json({ error: 'variant must be "simple" or "dense"' }, { status: 400 });
	}
	const titleErr = checkLength('thesis_title', title);
	if (titleErr) return titleErr;
	const descErr = checkLength('thesis_description', description);
	if (descErr) return descErr;

	if (!(await isLlmAvailable())) {
		return json({ error: 'LLM unavailable' }, { status: 503 });
	}

	const system = `You are an editor. ${INSTRUCTION[variant]} Keep the original meaning and stance intact — do not add or drop claims. Answer in the SAME language as the input. Output ONLY a compact JSON object with keys "title" and "description". No commentary.`;
	const prompt = `Title: ${title}\nDescription: ${description}`;

	const res = await generate(prompt, { system, maxTokens: 500, temperature: 0.3 });
	if (!res.ok) {
		return json({ error: res.error, hint: res.hint }, { status: 502 });
	}

	const match = res.text.match(/\{[\s\S]*\}/);
	if (!match) return json({ error: 'Draft response was not JSON' }, { status: 502 });
	try {
		const parsed = JSON.parse(match[0]) as { title?: string; description?: string };
		if (!parsed.title || !parsed.description) {
			return json({ error: 'Draft missing fields' }, { status: 502 });
		}
		return json({ title: parsed.title, description: parsed.description, variant });
	} catch {
		return json({ error: 'Draft JSON parse failed' }, { status: 502 });
	}
};
