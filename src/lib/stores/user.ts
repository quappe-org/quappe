// Persistent anonymous user identity for MVP
// Stored in localStorage, no login needed

const STORAGE_KEY = 'quappe_user_id';
const VOTED_ARGS_KEY = 'quappe_voted_args';

export function getUserId(): string {
	if (typeof window === 'undefined') return crypto.randomUUID();

	let userId = localStorage.getItem(STORAGE_KEY);
	if (!userId) {
		userId = crypto.randomUUID();
		localStorage.setItem(STORAGE_KEY, userId);
	}
	return userId;
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
