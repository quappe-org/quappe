// Nightly LLM batch: assign categories to arguments that don't yet have any.
//
// Human authors don't pick argument categories at write time (they picked one
// for the parent thesis, and forcing them again is friction). Instead we run
// this idempotent job daily: enumerate all arguments whose `categories` field
// is undefined, ask the local LLM to pick 1–2 topics from DEFAULT_CATEGORIES,
// and write them back via setArgumentCategories.
//
// If the LLM is unreachable or returns garbage, we fall back to ['other'] so
// the argument still gets categorised — better than an unbounded backlog.

import { getAllArguments, setArgumentCategories } from '$lib/stores/data';
import { DEFAULT_CATEGORIES } from '$lib/models/types';
import { generate, isLlmAvailable } from './llm';
import { logger } from '$lib/stores/logger';

const CAT_LIST = DEFAULT_CATEGORIES.join(', ');

function buildPrompt(content: string): string {
	return `You classify short debate arguments by topic.

Argument:
"""${content}"""

Pick 1 to 2 topical categories from this fixed list (comma-separated, no other words):
${CAT_LIST}

If nothing fits well, answer exactly: other
Answer with just the categories, no explanation.`;
}

function parseCategories(raw: string): string[] {
	// Grab tokens, lowercase, keep only known categories, dedupe, cap at 2.
	const known = new Set<string>(DEFAULT_CATEGORIES.map((c) => c.toLowerCase()));
	const tokens = raw
		.toLowerCase()
		.split(/[^a-zA-Z]+/)
		.map((t) => t.trim())
		.filter((t) => t.length > 0 && known.has(t));
	const deduped: string[] = [];
	for (const t of tokens) {
		if (!deduped.includes(t)) deduped.push(t);
		if (deduped.length >= 2) break;
	}
	return deduped.length > 0 ? deduped : ['other'];
}

/**
 * Categorise all arguments whose `categories` field is unset.
 * Returns the number of arguments successfully annotated.
 * Never throws — LLM failures fall through to ['other'].
 */
export async function categorizeUncategorizedArguments(): Promise<number> {
	const targets = getAllArguments().filter((a) => a.categories === undefined);
	if (targets.length === 0) {
		logger.info('system', 'argument categorizer: nothing to do');
		return 0;
	}

	const llmUp = await isLlmAvailable();
	if (!llmUp) {
		// LLM down — apply the safe default so arguments still get a label and
		// aren't retried forever. Tomorrow's run can re-categorise properly if
		// an admin resets `categories` to undefined (rare, manual).
		for (const a of targets) setArgumentCategories(a.id, ['other']);
		logger.warn('system', `argument categorizer: LLM down, defaulted ${targets.length} args to 'other'`);
		return targets.length;
	}

	logger.info('system', `argument categorizer: processing ${targets.length} arguments`);
	let done = 0;
	for (const arg of targets) {
		const result = await generate(buildPrompt(arg.content), {
			system: 'You are a strict classifier. Output only category names from the given list. No prose.',
			maxTokens: 20,
			temperature: 0.1
		});
		const cats = result.ok ? parseCategories(result.text) : ['other'];
		setArgumentCategories(arg.id, cats);
		done++;
		if (done % 25 === 0) {
			logger.info('system', `argument categorizer: ${done}/${targets.length}`);
		}
		// Yield so request handling doesn't starve during a long batch.
		await new Promise((r) => setImmediate(r));
	}
	logger.info('system', `argument categorizer: done ${done}/${targets.length}`);
	return done;
}
