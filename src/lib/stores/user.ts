// Anonymous user identity for MVP.
//
// The AUTHORITATIVE identity now lives in a server-set, HMAC-signed cookie
// (see src/lib/server/identity.ts). The client learns its own id by calling
// GET /api/me once at boot and caches it in localStorage for synchronous
// access — but the server IGNORES any user_id/author_id fields in request
// bodies and trusts only the cookie.
//
// Legacy: previous versions minted a UUID client-side. If we find one in
// localStorage, we keep using it until /api/me tells us otherwise (which it
// will if the cookie disagrees).

const STORAGE_KEY = 'quappe_user_id';
const VOTED_ARGS_KEY = 'quappe_voted_args';

let cached: string | null = null;

/**
 * Fetch the authoritative user_id from the server and cache it. Should be
 * called once at app boot (from the root layout's onMount). Overrides any
 * stale localStorage value so client and cookie agree.
 */
export async function bootstrapUserId(): Promise<string> {
	if (typeof window === 'undefined') return '';
	try {
		const res = await fetch('/api/me');
		if (res.ok) {
			const { user_id } = (await res.json()) as { user_id: string };
			if (user_id) {
				cached = user_id;
				localStorage.setItem(STORAGE_KEY, user_id);
				return user_id;
			}
		}
	} catch {
		// Fall through to whatever we have cached.
	}
	return getUserId();
}

export function getUserId(): string {
	if (cached) return cached;
	if (typeof window === 'undefined') return '';
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored) {
		cached = stored;
		return stored;
	}
	// No cookie roundtrip has happened yet AND no legacy value. Return a
	// throwaway UUID so callers don't break — bootstrapUserId() will fix
	// this once the network comes back.
	const tmp = crypto.randomUUID();
	cached = tmp;
	localStorage.setItem(STORAGE_KEY, tmp);
	return tmp;
}

export function getVotedArgs(): Set<string> {
	if (typeof window === 'undefined') return new Set();
	try {
		const raw = localStorage.getItem(VOTED_ARGS_KEY);
		return new Set(raw ? JSON.parse(raw) : []);
	} catch {
		return new Set();
	}
}

export function markVotedArg(argId: string): void {
	if (typeof window === 'undefined') return;
	const set = getVotedArgs();
	set.add(argId);
	localStorage.setItem(VOTED_ARGS_KEY, JSON.stringify([...set]));
}
