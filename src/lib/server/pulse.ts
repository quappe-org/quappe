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
import { baseLocale, type Locale } from '$lib/paraglide/runtime';

const PULSE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedPulse {
	generated_at: number;
	body: PulseBody;
}
const _cached = new Map<Locale, CachedPulse>();

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

interface PulseCopy {
	system: string;
	empty: string;
	buildPrompt: (stats: PulseStats) => string;
}

const PULSE_COPY: Record<Locale, PulseCopy> = {
	en: {
		system:
			'You observe an English-language debate platform. Short, crisp sentences. Descriptive, not judgmental. No emojis, no numbers, no bullet lists.',
		empty: 'Nothing happening in the community yet.',
		buildPrompt(stats) {
			const hotList = stats.hot_theses.map((t, i) => `${i + 1}. "${t.title}"`).join('\n') || '—';
			const complexList = stats.complex_theses.map((t, i) => `${i + 1}. "${t.title}"`).join('\n') || '—';
			const catList = stats.driving_categories.map((c) => c.name).join(', ') || '—';
			return `Write an English-language "community pulse" for a debate platform. Short, crisp sentences. Observing, not judging.

Hotly discussed:
${hotList}

Complex (contested, many arguments):
${complexList}

Categories with most activity: ${catList}

Write exactly 3 paragraphs, each 1-2 sentences:
1. What's hot right now — the common thread in content.
2. Where it gets complex — which thesis/theses show real contention.
3. A look ahead — one sentence on an under-represented area.

Do not repeat any numbers (they are shown alongside). No headings. Maximum 100 words total.`;
		}
	},
	de: {
		system:
			'Du beobachtest eine deutschsprachige Debatten-Plattform. Kurze, knackige Sätze. Beschreibend, nicht wertend. Keine Emojis, keine Zahlen, keine Aufzählungen.',
		empty: 'Noch nichts los in der Community.',
		buildPrompt(stats) {
			const hotList = stats.hot_theses.map((t, i) => `${i + 1}. "${t.title}"`).join('\n') || '—';
			const complexList = stats.complex_theses.map((t, i) => `${i + 1}. "${t.title}"`).join('\n') || '—';
			const catList = stats.driving_categories.map((c) => c.name).join(', ') || '—';
			return `Fasse einen deutschsprachigen "Community-Puls" für eine Debatten-Plattform. Kurze, knackige Sätze. Beobachtend, nicht wertend.

Heiß diskutiert:
${hotList}

Komplex (kontrovers, viele Argumente):
${complexList}

Kategorien mit meiste Aktivität: ${catList}

Schreibe genau 3 Absätze, jeweils 1-2 Sätze:
1. Was gerade heiß ist — inhaltlicher Nenner.
2. Wo es komplex wird — welche These(n) zeigen echte Kontroverse.
3. Blick nach vorn — ein Satz zu einem unterrepräsentierten Feld.

Keine Zahlen wiederholen (die stehen daneben). Keine Überschriften. Maximum 100 Wörter insgesamt.`;
		}
	},
	fr: {
		system:
			"Tu observes une plateforme de débat francophone. Phrases courtes et nettes. Descriptif, pas de jugement. Pas d'emojis, pas de chiffres, pas de listes à puces.",
		empty: 'Rien ne bouge encore dans la communauté.',
		buildPrompt(stats) {
			const hotList = stats.hot_theses.map((t, i) => `${i + 1}. « ${t.title} »`).join('\n') || '—';
			const complexList = stats.complex_theses.map((t, i) => `${i + 1}. « ${t.title} »`).join('\n') || '—';
			const catList = stats.driving_categories.map((c) => c.name).join(', ') || '—';
			return `Rédige un « pouls communautaire » en français pour une plateforme de débat. Phrases courtes et nettes. Observation, pas de jugement.

Vivement débattues :
${hotList}

Complexes (contestées, beaucoup d'arguments) :
${complexList}

Catégories les plus actives : ${catList}

Écris exactement 3 paragraphes, 1 à 2 phrases chacun :
1. Ce qui est chaud en ce moment — le fil conducteur des contenus.
2. Où cela se complique — quelle(s) thèse(s) montrent une vraie contestation.
3. Un regard vers l'avant — une phrase sur un domaine sous-représenté.

Ne répète aucun chiffre (ils sont affichés à côté). Pas de titres. Maximum 100 mots au total.`;
		}
	},
	es: {
		system:
			'Observas una plataforma de debate en español. Frases cortas y nítidas. Descriptivo, no valorativo. Sin emojis, sin cifras, sin listas.',
		empty: 'Aún no hay movimiento en la comunidad.',
		buildPrompt(stats) {
			const hotList = stats.hot_theses.map((t, i) => `${i + 1}. «${t.title}»`).join('\n') || '—';
			const complexList = stats.complex_theses.map((t, i) => `${i + 1}. «${t.title}»`).join('\n') || '—';
			const catList = stats.driving_categories.map((c) => c.name).join(', ') || '—';
			return `Redacta un «pulso de la comunidad» en español para una plataforma de debate. Frases cortas y nítidas. Observando, sin juzgar.

Muy debatidas:
${hotList}

Complejas (disputadas, muchos argumentos):
${complexList}

Categorías con más actividad: ${catList}

Escribe exactamente 3 párrafos, 1 o 2 frases cada uno:
1. Qué está caliente ahora — el hilo común del contenido.
2. Dónde se vuelve complejo — qué tesis muestran verdadera disputa.
3. Una mirada hacia adelante — una frase sobre un área infrarrepresentada.

No repitas ninguna cifra (se muestran al lado). Sin encabezados. Máximo 100 palabras en total.`;
		}
	}
};

export async function generatePulse(locale: Locale = baseLocale): Promise<PulseBody> {
	const stats = aggregate();
	const copy = PULSE_COPY[locale] ?? PULSE_COPY[baseLocale];

	if (stats.total_theses === 0) {
		return {
			text: copy.empty,
			stats,
			generated_at: new Date().toISOString(),
			llm: { ok: true, model: null, duration_ms: 0 }
		};
	}

	const prompt = copy.buildPrompt(stats);
	const result = await generate(prompt, {
		system: copy.system,
		maxTokens: 300
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

export function getCachedPulse(locale: Locale = baseLocale): { body: PulseBody; generated_at: number } | null {
	const hit = _cached.get(locale);
	if (!hit) return null;
	if (Date.now() - hit.generated_at > PULSE_TTL_MS) return null;
	return hit;
}

export async function refreshPulseCache(locale: Locale = baseLocale): Promise<PulseBody> {
	const body = await generatePulse(locale);
	_cached.set(locale, { generated_at: Date.now(), body });
	return body;
}
