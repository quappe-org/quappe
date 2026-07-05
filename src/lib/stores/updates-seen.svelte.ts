// Tracks the last time the user visited /my/updates.
// Used to compute the unread badge count and per-item "new" markers.

const SEEN_KEY = 'quappe_updates_last_seen';

function loadSeen(): string | null {
	if (typeof window === 'undefined') return null;
	return localStorage.getItem(SEEN_KEY);
}

class UpdatesSeenStore {
	last_seen = $state<string | null>(loadSeen());

	markAllSeen(nowIso: string = new Date().toISOString()): void {
		this.last_seen = nowIso;
		if (typeof window !== 'undefined') localStorage.setItem(SEEN_KEY, nowIso);
	}

	unreadCount(events: { at: string }[]): number {
		if (!this.last_seen) return events.length;
		const cutoff = this.last_seen;
		let n = 0;
		for (const e of events) if (e.at > cutoff) n++;
		return n;
	}

	isNew(at: string): boolean {
		return !this.last_seen || at > this.last_seen;
	}
}

export const updatesSeen = new UpdatesSeenStore();
