import { seedData } from '$lib/stores/data';

// In dev mode we seed on the very first authenticated request so the dev
// user's id (from their signed cookie) can own a handful of "my theses".
// Production skips this and relies on real user activity.

let seeded = false;

export function isSeeded(): boolean {
	return seeded;
}

export function seedOnce(devUserId: string | undefined): void {
	if (seeded) return;
	if (process.env.NODE_ENV === 'production') {
		// In prod: seed once without a dev user (empty tenants get generic demo data).
		seedData();
	} else {
		seedData(devUserId);
	}
	seeded = true;
}
