// Persistent anonymous user identity for MVP
// Stored in localStorage, no login needed

const STORAGE_KEY = 'quappe_user_id';

export function getUserId(): string {
	if (typeof window === 'undefined') return crypto.randomUUID();

	let userId = localStorage.getItem(STORAGE_KEY);
	if (!userId) {
		userId = crypto.randomUUID();
		localStorage.setItem(STORAGE_KEY, userId);
	}
	return userId;
}
