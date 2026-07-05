// Signed-cookie identity for the MVP.
// The client no longer decides its own UUID — the server mints one, signs it
// with HMAC-SHA256, and sets it as an httpOnly cookie. Every request carries
// this cookie and the hook verifies it before handing `locals.user_id` to
// route handlers. Request bodies may still contain `user_id`/`author_id`
// fields, but those are IGNORED for identity — only the cookie counts.
//
// Env:
//   QUAPPE_SECRET — HMAC secret. If unset, a random one is generated at
//                   startup. That means cookies invalidate on every restart
//                   in dev — set QUAPPE_SECRET in .env / prod to persist.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { logger } from '$lib/stores/logger';

const COOKIE_NAME = 'quappe_uid';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function getSecret(): string {
	const env = process.env.QUAPPE_SECRET;
	if (env && env.length >= 16) return env;
	if (!_ephemeralSecret) {
		_ephemeralSecret = randomBytes(32).toString('hex');
		logger.warn(
			'system',
			'QUAPPE_SECRET not set — using ephemeral secret. Cookies will invalidate on restart.'
		);
	}
	return _ephemeralSecret;
}
let _ephemeralSecret: string | null = null;

function sign(uuid: string): string {
	return createHmac('sha256', getSecret()).update(uuid).digest('hex');
}

function verify(uuid: string, sig: string): boolean {
	const expected = sign(uuid);
	if (expected.length !== sig.length) return false;
	try {
		return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
	} catch {
		return false;
	}
}

// UUID v4 pattern - basic shape check before we HMAC anything.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
	return UUID_RE.test(s);
}

function encode(uuid: string): string {
	return `${uuid}.${sign(uuid)}`;
}

function decode(raw: string): string | null {
	const dot = raw.indexOf('.');
	if (dot < 0) return null;
	const uuid = raw.slice(0, dot);
	const sig = raw.slice(dot + 1);
	if (!isUuid(uuid)) return null;
	if (!verify(uuid, sig)) return null;
	return uuid;
}

/**
 * Read the user_id from the signed cookie. Returns null if no cookie or
 * signature invalid. Never throws.
 */
export function readUserId(cookies: Cookies): string | null {
	const raw = cookies.get(COOKIE_NAME);
	if (!raw) return null;
	return decode(raw);
}

/**
 * Set (or refresh) the identity cookie. Uses httpOnly + sameSite=lax so JS
 * can't touch it and CSRF from other sites can't smuggle it.
 */
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
 * Get-or-create: returns a verified user_id, minting + setting a new one
 * if no valid cookie exists. Use this from the hook.
 */
export function ensureUserId(cookies: Cookies): string {
	const existing = readUserId(cookies);
	if (existing) return existing;
	return mintAndSet(cookies);
}
