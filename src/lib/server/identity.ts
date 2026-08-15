// JWT-based anonymous identity for Quappe.
//
// The client never decides its own id. The server mints a UUID, wraps it in a
// signed JWT (HS256) and sets it as an httpOnly cookie. Every request carries
// the cookie; the hook verifies it and hands `locals.user_id` to handlers.
// Request bodies may still contain user_id/author_id, but those are IGNORED —
// only the verified token counts.
//
// Why a real JWT (not just uuid.hmac):
//   - `iat` (issued-at) enables Sybil heuristics: a brand-new identity that
//     immediately floods votes can be discounted (see identityAgeMs()).
//   - `exp` gives tokens a natural lifetime.
//   - Standard shape is Phase-2 ready (magic-link auth can mint the same token).
//
// No external dependency — HS256 is ~40 lines on node:crypto, keeping the
// project's 2-dependency footprint.
//
// Env:
//   QUAPPE_SECRET — HMAC secret. If unset, a random one is generated at
//                   startup (tokens invalidate on restart in dev). Set it in
//                   .env / prod to persist identities across restarts.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { logger } from '$lib/stores/logger';

const COOKIE_NAME = 'quappe_uid';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
const TOKEN_TTL_SEC = 60 * 60 * 24 * 365; // JWT exp horizon: 1 year
const ISSUER = 'quappe';

// ---- secret ----
let _ephemeralSecret: string | null = null;
function getSecret(): string {
	const env = process.env.QUAPPE_SECRET;
	if (env && env.length >= 16) return env;
	if (!_ephemeralSecret) {
		_ephemeralSecret = randomBytes(32).toString('hex');
		logger.warn(
			'system',
			'QUAPPE_SECRET not set — using ephemeral secret. Tokens invalidate on restart.'
		);
	}
	return _ephemeralSecret;
}

// ---- base64url ----
function b64url(buf: Buffer | string): string {
	return Buffer.from(buf).toString('base64url');
}
function b64urlJson(obj: unknown): string {
	return b64url(JSON.stringify(obj));
}

// ---- JWT payload ----
interface JwtClaims {
	sub: string; // the UUID (user_id)
	iat: number; // issued-at (unix seconds)
	exp: number; // expiry (unix seconds)
	iss: string; // issuer
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
	return UUID_RE.test(s);
}

const HEADER = b64urlJson({ alg: 'HS256', typ: 'JWT' });

function signingInput(payloadSeg: string): string {
	return `${HEADER}.${payloadSeg}`;
}

function hmac(input: string): string {
	return createHmac('sha256', getSecret()).update(input).digest('base64url');
}

/** Mint a JWT for a given UUID. */
export function encode(uuid: string): string {
	const now = Math.floor(Date.now() / 1000);
	const claims: JwtClaims = {
		sub: uuid,
		iat: now,
		exp: now + TOKEN_TTL_SEC,
		iss: ISSUER
	};
	const payloadSeg = b64urlJson(claims);
	const sig = hmac(signingInput(payloadSeg));
	return `${HEADER}.${payloadSeg}.${sig}`;
}

/** Decode + verify a JWT. Returns claims or null. Never throws. */
export function decodeClaims(token: string): JwtClaims | null {
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	const [header, payloadSeg, sig] = parts;
	if (header !== HEADER) return null; // fixed header — reject alg confusion

	// Verify signature (constant-time).
	const expected = hmac(signingInput(payloadSeg));
	try {
		const a = Buffer.from(expected);
		const b = Buffer.from(sig);
		if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
	} catch {
		return null;
	}

	// Parse claims.
	let claims: JwtClaims;
	try {
		claims = JSON.parse(Buffer.from(payloadSeg, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
	if (!claims || typeof claims.sub !== 'string' || !isUuid(claims.sub)) return null;
	if (claims.iss !== ISSUER) return null;
	if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) return null;

	return claims;
}

/** Extract just the verified user_id from a token. */
function decode(token: string): string | null {
	return decodeClaims(token)?.sub ?? null;
}

/**
 * Read the user_id from the JWT cookie. Returns null if no cookie, bad
 * signature, or expired. Never throws.
 */
export function readUserId(cookies: Cookies): string | null {
	const raw = cookies.get(COOKIE_NAME);
	if (!raw) return null;
	return decode(raw);
}

/** Read the full verified claims (for age/expiry heuristics). */
export function readClaims(cookies: Cookies): JwtClaims | null {
	const raw = cookies.get(COOKIE_NAME);
	if (!raw) return null;
	return decodeClaims(raw);
}

/**
 * How old is this identity, in ms? Returns Infinity if no valid token
 * (treat unknown as "old" so we never over-penalise). Used for Sybil
 * heuristics: a token minted seconds ago that floods votes is suspicious.
 */
export function identityAgeMs(cookies: Cookies): number {
	const claims = readClaims(cookies);
	if (!claims) return Infinity;
	return Date.now() - claims.iat * 1000;
}

/** Set (or refresh) the identity cookie. httpOnly + sameSite=lax. */
export function setUserIdCookie(cookies: Cookies, user_id: string): void {
	cookies.set(COOKIE_NAME, encode(user_id), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		maxAge: COOKIE_MAX_AGE
	});
}

/** Mint a fresh UUID and immediately set the cookie. */
export function mintAndSet(cookies: Cookies): string {
	const uuid = crypto.randomUUID();
	setUserIdCookie(cookies, uuid);
	return uuid;
}

/**
 * Get-or-create: returns a verified user_id, minting + setting a new token
 * if no valid cookie exists. Use this from the hook.
 */
export function ensureUserId(cookies: Cookies): string {
	const existing = readUserId(cookies);
	if (existing) return existing;
	return mintAndSet(cookies);
}
