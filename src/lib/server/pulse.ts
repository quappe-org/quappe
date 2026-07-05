// Community-Puls-Report — shared state so both the API endpoint and the
// startup/daily background job in hooks.server.ts can populate the same cache.

import {
	getAllTheses,
	getArgumentCounts,
	getHeatMap,
	computeVoteSummary,
	seedData
} from '$lib/stores/data';
import { generate } from './llm';

const PULSE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedPulse {
	generated_at: number;
	body: PulseBody;
}
let _cached: CachedPulse | null = null;

interface CategoryPulse {
	name: string;
	thesis_count: number;
	argument_count: number;
	avg_support_ratio: number;
}

export interface PulseStats {
	total_theses: number;
	total_arguments: number;
	hot_theses: { id: string; title: string; heat: number; arguments: number }[];
	complex_theses: { id: string; title: string; arguments: number }[];
	driving_categories: CategoryPulse[];
	recent_week: { new_theses: number; new_arguments: number };
}

export interface PulseBody {
	text: string | null;
	stats: PulseStats;
	generated_at: string;
	llm: { ok: boolean; model?: string | null; duration_ms?: number; error?: string; hint?: string };
}

function aggregate(): PulseStats {
	seedData();
	const theses = getAllTheses();
	const argCounts = getArgumentCounts();
	const heat = getHeatMap();
	const NOW = Date.now();
	const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

	let total_arguments = 0;
	for (const n of argCounts.values()) total_arguments += n;

	let new_theses = 0;
	for (const t of theses) {
		if (NOW - new Date(t.meta.created_at).getTime() < WEEK_MS) new_theses++;
	}

	const hot_theses = [...theses]
		.map((t) => ({
			id: t.id,
			title: t.title,
			heat: heat.get(t.id) ?? 0,
			arguments: argCounts.get(t.id) ?? 0
		}))
		.filter((t) => t.heat > 0 || t.arguments > 0)
		.sort((a, b) => b.heat - a.heat)
		.slice(0, 5);

	const complex_theses = [...theses]
		.map((t) => {
			const summary = computeVoteSummary(t.votes);
			const total = summary.total || 1;
			const balance = 1 - Math.abs(summary.support - summary.reject) / total;
			const args = argCounts.get(t.id) ?? 0;
			return { id: t.id, title: t.title, arguments: args, balance };
		})
		.filter((t) => t.arguments >= 2 && t.balance > 0.4)
		.sort((a, b) => b.balance * b.arguments - a.balance * a.arguments)
		.slice(0, 5)
		.map(({ balance, ...rest }) => rest);

	const catStats = new Map<string, { theses: number; args: number; support: number; total: number }>();
	for (const t of theses) {
		const summary = computeVoteSummary(t.votes);
		const args = argCounts.get(t.id) ?? 0;
		for (const c of t.categories) {
			const s = catStats.get(c) ?? { theses: 0, args: 0, support: 0, total: 0 };
			s.theses += 1;
			s.args += args;
			s.support += summary.support;
			s.total += summary.total;
			catStats.set(c, s);
		}
	}
	const driving_categories: CategoryPulse[] = [...catStats.entries()]
		.map(([name, s]) => ({
			name,
			thesis_count: s.theses,
			argument_count: s.args,
			avg_support_ratio: s.total > 0 ? s.support / s.total : 0
		}))
		.sort((a, b) => b.argument_count - a.argument_count)
		.slice(0, 5);

	return {
		total_theses: theses.length,
		total_arguments,
		hot_theses,
		complex_theses,
		driving_categories,
		recent_week: { new_theses, new_arguments: 0 }
	};
}

function buildPrompt(stats: PulseStats): string {
	const hotList = stats.hot_theses.map((t, i) => `${i + 1}. "${t.title}" (heat ${t.heat.toFixed(2)}, ${t.arguments} Args)`).join('\n') || '—';
	const complexList = stats.complex_theses.map((t, i) => `${i + 1}. "${t.title}" (${t.arguments} Args)`).join('\n') || '—';
	const catList =
		stats.driving_categories
			.map(
				(c) =>
					`${c.name}: ${c.thesis_count} Thesen, ${c.argument_count} Argumente, ${Math.round(c.avg_support_ratio * 100)}% Zustimmung`
			)
			.join('\n') || '—';

	return `Erstelle einen kompakten deutschsprachigen "Community-Puls"-Report für eine Debatten-Plattform. Beobachtend, nicht wertend.

Aktuelle Zahlen:
- Thesen gesamt: ${stats.total_theses}
- Argumente gesamt: ${stats.total_arguments}
- Neu in den letzten 7 Tagen: ${stats.recent_week.new_theses} Thesen

Heiß diskutiert (nach Aktivitäts-Score):
${hotList}

Komplex (viele Argumente + ausgeglichene Vote-Verteilung):
${complexList}

Kategorien-Treiber:
${catList}

Schreibe 4 kurze Absätze:
1. "Was bewegt gerade" — heiße Themen, was inhaltlich verbindet.
2. "Wo es komplex wird" — welche Thesen zeigen echte Kontroverse.
3. "Kategorien, die die Community treiben" — wo passiert die meiste Arbeit.
4. "Blick nach vorn" — ein Satz: welches Feld wirkt unterrepräsentiert oder verdient mehr Aufmerksamkeit.

Maximum 250 Wörter, keine Überschriften, nur die vier Absätze.`;
}

export async function generatePulse(): Promise<PulseBody> {
	const stats = aggregate();

	if (stats.total_theses === 0) {
		return {
			text: 'Noch nichts los in der Community.',
			stats,
			generated_at: new Date().toISOString(),
			llm: { ok: true, model: null, duration_ms: 0 }
		};
	}

	const prompt = buildPrompt(stats);
	const result = await generate(prompt, {
		system: 'Du beobachtest eine deutschsprachige Debatten-Plattform. Beschreibend, nicht wertend, keine Emojis.'
	});

	return {
		text: result.ok ? result.text : null,
		stats,
		generated_at: new Date().toISOString(),
		llm: result.ok
			? { ok: true, model: result.model, duration_ms: result.duration_ms }
			: { ok: false, error: result.error, hint: result.hint }
	};
}

export function getCachedPulse(): { body: PulseBody; generated_at: number } | null {
	if (!_cached) return null;
	if (Date.now() - _cached.generated_at > PULSE_TTL_MS) return null;
	return _cached;
}

export async function refreshPulseCache(): Promise<PulseBody> {
	const body = await generatePulse();
	_cached = { generated_at: Date.now(), body };
	return body;
}
