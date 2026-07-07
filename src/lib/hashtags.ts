// User-typed hashtag extraction. Hashtags are #-prefixed tokens in the body
// text of theses/arguments. Stored lowercased, without the leading '#'.
//
// Rules:
//   - Must follow start-of-string or whitespace (so URLs like example.com/#anchor don't match)
//   - Body chars: unicode letters, digits, underscore
//   - Length 2..32
//   - Deduplicated per row, cap of MAX_PER_ROW applied by callers

const RE = /(?:^|\s)#([\p{L}\p{N}_]{2,32})/gu;

export const MAX_HASHTAGS_PER_ROW = 10;

export function extractHashtags(text: string | null | undefined): string[] {
	if (!text) return [];
	const seen = new Set<string>();
	for (const m of text.matchAll(RE)) seen.add(m[1].toLowerCase());
	return [...seen];
}

export function extractHashtagsFrom(...texts: (string | null | undefined)[]): string[] {
	const seen = new Set<string>();
	for (const t of texts) {
		for (const h of extractHashtags(t)) seen.add(h);
	}
	return [...seen].slice(0, MAX_HASHTAGS_PER_ROW);
}
