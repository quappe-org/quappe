// Detect argument metadata from raw text.
//
// Design:
// - URLs are extracted from the argument content by regex and returned as a list.
// - Evidence type is derived from the URL domain(s) using a small whitelist.
// - Users only explicitly choose ONE thing: whether this is emotional (Herzensangelegenheit).
//   Emotional overrides everything - it's a human signal, not a fact claim.

import type { ArgumentAttribute, EvidenceType } from '$lib/models/types';

// Rough but robust URL matcher. Trailing punctuation is stripped.
const URL_RE = /\bhttps?:\/\/[^\s<>"'()]+/gi;

/** Domains that indicate peer-reviewed studies / academic sources. */
const STUDY_DOMAINS: RegExp[] = [
	/\.edu(\.|\/|$)/i,
	/\.ac\.[a-z]{2,}(\/|$)/i, // ac.uk, ac.at, ac.jp ...
	/\bdoi\.org\b/i,
	/\barxiv\.org\b/i,
	/\bnature\.com\b/i,
	/\bscience(mag)?\.org\b/i,
	/\bpubmed(\.ncbi)?\.nlm\.nih\.gov\b/i,
	/\bnih\.gov\b/i,
	/\bwho\.int\b/i,
	/\bsciencedirect\.com\b/i,
	/\bjstor\.org\b/i,
	/\bmpg\.de\b/i, // Max-Planck
	/\bfraunhofer\.de\b/i,
	/\bcochrane(library)?\.org\b/i,
	/\bplos(one)?\.org\b/i,
	/\bresearchgate\.net\b/i
];

/** Domains that indicate authoritative bodies / recognised references. */
const AUTHORITY_DOMAINS: RegExp[] = [
	/\.gov(\.|\/|$)/i,
	/\bwikipedia\.org\b/i,
	/\beuropa\.eu\b/i,
	/\bbund(esregierung)?\.de\b/i,
	/\bbundestag\.de\b/i,
	/\bbverfg\.de\b/i, // German Federal Constitutional Court
	/\boecd\.org\b/i,
	/\bimf\.org\b/i,
	/\bworldbank\.org\b/i,
	/\bstatista\.com\b/i,
	/\bdestatis\.de\b/i,
	/\bec\.europa\.eu\b/i,
	/\bunicef\.org\b/i,
	/\bipcc\.ch\b/i
];

/** Extract all URLs from a text. Duplicates removed, trailing punctuation stripped. */
export function extractUrls(text: string): string[] {
	if (!text) return [];
	const matches = text.match(URL_RE) ?? [];
	const cleaned = new Set<string>();
	for (const raw of matches) {
		// Strip common trailing punctuation that shouldn't be part of the URL.
		const url = raw.replace(/[.,;:!?)]+$/, '');
		cleaned.add(url);
	}
	return Array.from(cleaned);
}

/** Classify a single URL as study | authority | logical. */
export function classifyUrl(url: string): EvidenceType {
	for (const re of STUDY_DOMAINS) if (re.test(url)) return 'study';
	for (const re of AUTHORITY_DOMAINS) if (re.test(url)) return 'authority';
	return 'logical'; // linked but no known domain -> treat as logical reference
}

export interface DerivedEvidence {
	attributes: ArgumentAttribute[];
	urls: string[]; // deduplicated, in the order they appeared
}

/**
 * Derive argument attributes from raw content and a user-supplied "isEmotional" flag.
 *
 * - Emotional flag wins - it produces exactly one attribute of type 'emotional' (no URL).
 * - Otherwise, we extract all URLs, classify each, and produce one attribute per URL.
 *   The best-ranked evidence type (study > authority > logical) is used when picking
 *   the primary type for badge display.
 * - No URLs + not emotional -> a single 'logical' attribute (default text argument).
 */
export function deriveArgumentAttributes(content: string, isEmotional: boolean): DerivedEvidence {
	if (isEmotional) {
		return { attributes: [{ evidence_type: 'emotional' }], urls: [] };
	}

	const urls = extractUrls(content);
	if (urls.length === 0) {
		return { attributes: [{ evidence_type: 'logical' }], urls: [] };
	}

	const attributes: ArgumentAttribute[] = urls.map((url) => ({
		evidence_type: classifyUrl(url),
		source_url: url
	}));

	return { attributes, urls };
}

/** Determine the "headline" evidence type for badge display (best of all attributes). */
export function primaryEvidenceType(attributes: ArgumentAttribute[]): EvidenceType {
	const rank: Record<EvidenceType, number> = {
		study: 4,
		authority: 3,
		experiential: 2,
		emotional: 2,
		logical: 1
	};
	let best: EvidenceType = 'logical';
	let bestRank = 0;
	for (const a of attributes) {
		const r = rank[a.evidence_type] ?? 0;
		if (r > bestRank) {
			best = a.evidence_type;
			bestRank = r;
		}
	}
	return best;
}
