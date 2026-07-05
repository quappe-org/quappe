// Session-scoped store for /my/updates events.
// Fetched from /api/reports/updates. Identity comes from the server's signed
// cookie — no user_id in the URL. Refreshed on demand and via a 60s poll
// started from the root layout.

export type UpdateKind = 'fork' | 'new_argument' | 'vote_on_argument' | 'vote_on_thesis';

export interface UpdateEvent {
	kind: UpdateKind;
	at: string;
	thesis_id: string;
	thesis_title: string;
	original_argument_id?: string;
	original_content?: string;
	fork_argument_id?: string;
	fork_content?: string;
	argument_id?: string;
	argument_stance?: 'support' | 'reject';
	argument_content?: string;
	vote_type?: 'support' | 'reject' | 'neutral';
	vote_weight?: number;
	target_argument_id?: string;
	target_argument_content?: string;
}

interface UpdatesResponse {
	user_id: string;
	generated_at: string;
	events: UpdateEvent[];
	counts: {
		forks: number;
		new_arguments: number;
		votes_on_arguments: number;
		votes_on_theses: number;
		total: number;
	};
}

class UpdatesStore {
	events = $state<UpdateEvent[]>([]);
	loading = $state(false);
	generated_at = $state<string | null>(null);

	async refresh(): Promise<void> {
		if (typeof window === 'undefined') return;
		if (this.loading) return;
		this.loading = true;
		try {
			const res = await fetch('/api/reports/updates');
			if (!res.ok) return;
			const body = (await res.json()) as UpdatesResponse;
			this.events = body.events;
			this.generated_at = body.generated_at;
		} finally {
			this.loading = false;
		}
	}
}

export const updatesStore = new UpdatesStore();
