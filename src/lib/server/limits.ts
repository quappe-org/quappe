// Server-side abuse guards: length caps + per-IP + per-user rate limits.
// In-memory, MVP-scale. Bucket state resets on server restart, which is fine
// while the data store itself is also in-memory.

import { json } from '@sveltejs/kit';

export const LIMITS = {
	thesis_title: 200,
	thesis_description: 2000,
	argument_content: 800,
	search_query: 200,
	category_name: 40,
	max_categories: 8
} as const;

export type FieldName = keyof typeof LIMITS;

/**
 * Validate a string field against its cap. Returns an error Response on
 * violation, or `null` if OK. Also rejects non-strings and empty-after-trim.
 */
export function checkLength(field: FieldName, value: unknown): Response | null {
	if (typeof value !== 'string') {
		return json({ error: `Field "${field}" must be a string` }, { status: 400 });
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return json({ error: `Field "${field}" must not be empty` }, { status: 400 });
	}
	const cap = LIMITS[field];
	if (trimmed.length > cap) {
		return json(
			{ error: `Field "${field}" exceeds ${cap} chars (got ${trimmed.length})` },
			{ status: 413 }
		);
	}
	return null;
}

export function checkCategories(value: unknown): Response | null {
	if (!Array.isArray(value)) {
		return json({ error: 'Field "categories" must be an array' }, { status: 400 });
	}
	if (value.length === 0) {
		return json({ error: 'At least one category is required' }, { status: 400 });
	}
	if (value.length > LIMITS.max_categories) {
		return json(
			{ error: `Too many categories (max ${LIMITS.max_categories})` },
			{ status: 413 }
		);
	}
	for (const c of value) {
		if (typeof c !== 'string' || c.trim().length === 0) {
			return json({ error: 'Each category must be a non-empty string' }, { status: 400 });
		}
		if (c.length > LIMITS.category_name) {
			return json(
				{ error: `Category name exceeds ${LIMITS.category_name} chars` },
				{ status: 413 }
			);
		}
	}
	return null;
}

// ---- Rate limiting ----
// Token-bucket per key. Buckets refill at `refillPerSec` up to `capacity`.
// If a request finds an empty bucket, it's rejected with 429.

interface Bucket {
	tokens: number;
	updated: number; // ms epoch
}

interface Policy {
	capacity: number;
	refillPerSec: number;
}

const buckets = new Map<string, Bucket>();

// Sweep old buckets every 5 min so long-running processes don't leak memory.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const BUCKET_TTL_MS = 30 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number): void {
	if (now - lastSweep < SWEEP_INTERVAL_MS) return;
	for (const [key, b] of buckets) {
		if (now - b.updated > BUCKET_TTL_MS) buckets.delete(key);
	}
	lastSweep = now;
}

function take(key: string, policy: Policy): boolean {
	const now = Date.now();
	sweep(now);
	let b = buckets.get(key);
	if (!b) {
		b = { tokens: policy.capacity, updated: now };
		buckets.set(key, b);
	} else {
		const elapsed = (now - b.updated) / 1000;
		b.tokens = Math.min(policy.capacity, b.tokens + elapsed * policy.refillPerSec);
		b.updated = now;
	}
	if (b.tokens < 1) return false;
	b.tokens -= 1;
	return true;
}

// Policies tuned for MVP scale. All numbers per key (IP or user).
// "write_heavy" = create thesis / argument (expensive: also triggers embedding)
// "write_light" = vote (cheap, but easy to spam-flood)
// "read"        = search / read endpoints
const POLICIES: Record<string, Policy> = {
	write_heavy: { capacity: 10, refillPerSec: 10 / 60 }, // 10 burst, ~10/min sustained
	write_light: { capacity: 30, refillPerSec: 30 / 60 }, // 30 burst, ~30/min sustained
	read: { capacity: 60, refillPerSec: 60 / 60 } // 60 burst, ~60/min sustained
};

export type RateClass = keyof typeof POLICIES;

/**
 * Rate-limit a request by IP + (optional) user_id. Returns a 429 Response if
 * the caller has exhausted either bucket, else null.
 *
 * We check both keys so a single IP can't spin up UUIDs to bypass, AND a
 * single UUID can't jump between IPs to bypass.
 */
export function checkRate(
	ip: string,
	user_id: string | null,
	klass: RateClass
): Response | null {
	const policy = POLICIES[klass];
	const ipKey = `${klass}:ip:${ip}`;
	if (!take(ipKey, policy)) {
		return json(
			{ error: 'Too many requests. Slow down.' },
			{ status: 429, headers: { 'Retry-After': '60' } }
		);
	}
	if (user_id) {
		const userKey = `${klass}:u:${user_id}`;
		if (!take(userKey, policy)) {
			return json(
				{ error: 'Too many requests for this user. Slow down.' },
				{ status: 429, headers: { 'Retry-After': '60' } }
			);
		}
	}
	return null;
}

/** Client IP from a request event. Falls back to a constant so a proxy without
 * x-forwarded-for still triggers *some* bucket (better than nothing). */
export function getClientIp(request: Request, clientAddress: string): string {
	const fwd = request.headers.get('x-forwarded-for');
	if (fwd) return fwd.split(',')[0].trim();
	return clientAddress || 'unknown';
}
