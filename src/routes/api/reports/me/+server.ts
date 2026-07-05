import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getThesesByAuthor,
	getArgumentsByAuthor,
	getThesesVotedByUser,
	getThesisById
} from '$lib/stores/data';
import { generate } from '$lib/server/llm';
import type { Thesis, Argument } from '$lib/models/types';

// In-memory cache: 6h TTL, keyed by user_id.
interface CachedReport {
	generated_at: number;
	body: unknown;
}
const REPORT_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, CachedReport>();

interface StanceCounts {
	support: number;
	reject: number;
}

interface UserStats {
	theses_authored: number;
	arguments_authored: number;
	stance_split: StanceCounts;
	votes_cast: { support: number; reject: number; neutral: number };
	dominant_categories: { name: string; count: number }[];
	engaged_theses: number; // union of authored + voted + argued
	sample_own_arguments: { thesis_title: string; stance: string; content: string; thesis_id: string }[];
}

function aggregate(user_id: string): UserStats {
	const authoredTheses = getThesesByAuthor(user_id);
	const authoredArgs = getArgumentsByAuthor(user_id);
	const voted = getThesesVotedByUser(user_id);

	const stance_split: StanceCounts = { support: 0, reject: 0 };
	for (const a of authoredArgs) {
		if (a.stance === 'support') stance_split.support++;
		else if (a.stance === 'reject') stance_split.reject++;
	}

	const votes_cast = { support: 0, reject: 0, neutral: 0 };
	for (const { voteType } of voted) {
		if (voteType in votes_cast) votes_cast[voteType as keyof typeof votes_cast]++;
	}

	// Category frequency from any thesis the user touched
	const catCounts = new Map<string, number>();
	function bump(cats: string[]) {
		for (const c of cats) catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
	}
	for (const t of authoredTheses) bump(t.categories);
	for (const { thesis } of voted) bump(thesis.categories);
	for (const a of authoredArgs) {
		const parent = getThesisById(a.thesis_id);
		if (parent) bump(parent.categories);
	}
	const dominant_categories = [...catCounts.entries()]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 5);

	// Union count of engaged theses
	const touchedIds = new Set<string>();
	for (const t of authoredTheses) touchedIds.add(t.id);
	for (const { thesis } of voted) touchedIds.add(thesis.id);
	for (const a of authoredArgs) touchedIds.add(a.thesis_id);

	// Sample recent arguments for the LLM prompt (max 8, newest first)
	const argsSorted = [...authoredArgs].sort(
		(a, b) => new Date(b.meta.created_at).getTime() - new Date(a.meta.created_at).getTime()
	);
	const sample_own_arguments = argsSorted.slice(0, 8).map((a) => {
		const parent = getThesisById(a.thesis_id);
		return {
			thesis_id: a.thesis_id,
			thesis_title: parent?.title ?? '(unknown thesis)',
			stance: a.stance,
			content: a.content.length > 220 ? a.content.slice(0, 217) + '…' : a.content
		};
	});

	return {
		theses_authored: authoredTheses.length,
		arguments_authored: authoredArgs.length,
		stance_split,
		votes_cast,
		dominant_categories,
		engaged_theses: touchedIds.size,
		sample_own_arguments
	};
}

function buildPrompt(stats: UserStats): string {
	const cats = stats.dominant_categories.map((c) => `${c.name} (${c.count})`).join(', ') || '—';
	const sample = stats.sample_own_arguments.length
		? stats.sample_own_arguments
				.map(
					(s, i) =>
						`  [${i + 1}] These: "${s.thesis_title}"\n      Deine Position: ${s.stance}\n      Auszug: ${s.content}`
				)
				.join('\n')
		: '  (keine eigenen Argumente vorhanden)';

	return `Du bist ein wohlwollender Reflexions-Coach. Erstelle einen kurzen, deutschsprachigen "Wo stehe ich?"-Report für einen Debatten-User. KEINE Bewertung, KEIN Blaming — nur strukturierte Beobachtung, was seine Arbeit zeigt.

Nutze diese Fakten:
- Eigene Thesen: ${stats.theses_authored}
- Eigene Argumente: ${stats.arguments_authored} (pro: ${stats.stance_split.support}, contra: ${stats.stance_split.reject})
- Abgegebene Votes: pro ${stats.votes_cast.support}, contra ${stats.votes_cast.reject}, neutral ${stats.votes_cast.neutral}
- Beteiligte Thesen insgesamt: ${stats.engaged_theses}
- Häufigste Themenfelder: ${cats}

Beispiele seiner eigenen Argumente:
${sample}

Schreibe 3 Absätze:
1. "Deine Themen" — welche Felder dominieren, was verbindet sie inhaltlich.
2. "Deine Art zu argumentieren" — pro/contra-Balance, ob differenziert oder einseitig, ob Muster erkennbar. Nutze Formulierungen wie "häufig", "eher", "oft" statt harter Urteile.
3. "Blickfeld erweitern" — konkreter, freundlicher Vorschlag welche Perspektive/Kategorie er als nächstes anschauen könnte.

Maximum 220 Wörter insgesamt. Kein Titel, keine Überschriften — nur die drei Absätze.`;
}

export const GET: RequestHandler = async ({ url }) => {
	const user_id = url.searchParams.get('user_id');
	if (!user_id) return json({ error: 'user_id required' }, { status: 400 });

	const force = url.searchParams.get('force') === 'true';
	const cached = cache.get(user_id);
	if (!force && cached && Date.now() - cached.generated_at < REPORT_TTL_MS) {
		return json({ ...(cached.body as object), cached: true });
	}

	const stats = aggregate(user_id);

	// No data → no report, just structured empty response
	if (stats.engaged_theses === 0) {
		const body = {
			text: 'Noch keine Aktivität — sobald du Thesen erstellst, argumentierst oder abstimmst, gibt es hier deinen Reflexions-Report.',
			stats,
			references: [] as { thesis_id: string; snippet: string }[],
			cached: false,
			llm: { ok: true, model: null as string | null, duration_ms: 0 }
		};
		return json(body);
	}

	const prompt = buildPrompt(stats);
	const result = await generate(prompt, {
		system:
			'Du bist ein wohlwollender, präziser Reflexions-Coach. Deutsche Sprache, keine Wertungen, keine Emojis.'
	});

	if (!result.ok) {
		return json(
			{
				text: null,
				stats,
				references: [] as { thesis_id: string; snippet: string }[],
				cached: false,
				llm: result
			},
			{ status: 200 }
		);
	}

	const references = stats.sample_own_arguments.map((s) => ({
		thesis_id: s.thesis_id,
		snippet: s.thesis_title
	}));

	const body = {
		text: result.text,
		stats,
		references,
		cached: false,
		llm: { ok: true, model: result.model, duration_ms: result.duration_ms }
	};
	cache.set(user_id, { generated_at: Date.now(), body });
	return json(body);
};
