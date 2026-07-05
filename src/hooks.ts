import type { Reroute } from '@sveltejs/kit';
import { deLocalizeUrl } from '$lib/paraglide/runtime';

// Strip the locale prefix (e.g. /de, /fr, /es) from the URL so SvelteKit's
// router matches against the canonical route tree. The prefix stays in the
// browser URL — only the internal routing sees the de-localized path.
export const reroute: Reroute = ({ url }) => deLocalizeUrl(url).pathname;
