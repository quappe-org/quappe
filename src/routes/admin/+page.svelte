<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { LogEntry, LogLevel, LogSource } from '$lib/stores/logger';

	type TierStats = { hot: number; warm: number; cold: number; total: number };
	type LogStats = { total: number; buffered: number; capacity: number };

	let entries = $state<LogEntry[]>([]);
	let stats = $state<LogStats>({ total: 0, buffered: 0, capacity: 0 });
	let tiers = $state<TierStats>({ hot: 0, warm: 0, cold: 0, total: 0 });
	let lastSeq = $state(0);

	// Filter state
	let levelFilter = $state<'all' | LogLevel>('all');
	let sourceFilter = $state<'all' | LogSource>('all');
	let searchTerm = $state('');
	let paused = $state(false);
	let autoRefreshMs = $state(2000);

	// Auto-refresh interval id
	let pollId: ReturnType<typeof setInterval> | null = null;

	async function fetchLogs(replace = false) {
		if (paused && !replace) return;
		const params = new URLSearchParams();
		if (!replace && lastSeq > 0) params.set('since', String(lastSeq));
		if (levelFilter !== 'all') params.set('level', levelFilter);
		if (sourceFilter !== 'all') params.set('source', sourceFilter);
		params.set('limit', '500');

		try {
			const res = await fetch(`/api/admin/logs?${params}`);
			if (!res.ok) return;
			const data = await res.json();
			stats = data.stats;
			tiers = data.tiers;
			if (replace) {
				entries = data.entries;
			} else if (data.entries.length > 0) {
				// Append new entries, cap at 2000 for browser sanity
				entries = [...entries, ...data.entries].slice(-2000);
			}
			if (entries.length > 0) lastSeq = entries[entries.length - 1].seq;
		} catch (err) {
			// silent - the admin UI shouldn't self-log
		}
	}

	async function clearBuffer() {
		if (!confirm('Clear the log buffer on the server?')) return;
		await fetch('/api/admin/logs', { method: 'DELETE' });
		entries = [];
		lastSeq = 0;
		fetchLogs(true);
	}

	function reset() {
		entries = [];
		lastSeq = 0;
		fetchLogs(true);
	}

	// Restart polling whenever filters or interval change
	$effect(() => {
		if (pollId) clearInterval(pollId);
		// Refetch fresh when filters change
		reset();
		pollId = setInterval(() => fetchLogs(false), autoRefreshMs);
	});

	onDestroy(() => {
		if (pollId) clearInterval(pollId);
	});

	// Client-side text search
	let visibleEntries = $derived.by(() => {
		if (!searchTerm.trim()) return entries;
		const q = searchTerm.trim().toLowerCase();
		return entries.filter((e) => {
			if (e.message.toLowerCase().includes(q)) return true;
			if (e.meta) {
				const metaStr = JSON.stringify(e.meta).toLowerCase();
				if (metaStr.includes(q)) return true;
			}
			return false;
		});
	});

	function fmtTime(ts: number): string {
		const d = new Date(ts);
		return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
	}

	function fmtMeta(meta: Record<string, unknown> | undefined): string {
		if (!meta) return '';
		return Object.entries(meta)
			.map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
			.join(' ');
	}
</script>

<section class="admin-page">
	<header class="admin-head">
		<div>
			<h1>Admin · Logs</h1>
			<p class="hint">
				Ring buffer of recent server activity. Not persisted — resets when the process restarts.
			</p>
		</div>
		<div class="stats">
			<span class="stat"><b>{stats.buffered}</b>/{stats.capacity} buffered</span>
			<span class="stat"><b>{stats.total}</b> total events</span>
			<span class="stat tier"><b>{tiers.hot}</b> hot</span>
			<span class="stat tier warm"><b>{tiers.warm}</b> warm</span>
			<span class="stat tier cold"><b>{tiers.cold}</b> cold</span>
		</div>
	</header>

	<div class="toolbar">
		<label>
			<span>Level</span>
			<select bind:value={levelFilter}>
				<option value="all">all</option>
				<option value="debug">debug</option>
				<option value="info">info</option>
				<option value="warn">warn</option>
				<option value="error">error</option>
			</select>
		</label>

		<label>
			<span>Source</span>
			<select bind:value={sourceFilter}>
				<option value="all">all</option>
				<option value="api">api</option>
				<option value="store">store</option>
				<option value="lifecycle">lifecycle</option>
				<option value="cache">cache</option>
				<option value="seed">seed</option>
				<option value="system">system</option>
			</select>
		</label>

		<label class="search">
			<span>Search</span>
			<input type="text" bind:value={searchTerm} placeholder="message or meta value..." />
		</label>

		<label>
			<span>Refresh</span>
			<select bind:value={autoRefreshMs}>
				<option value={1000}>1s</option>
				<option value={2000}>2s</option>
				<option value={5000}>5s</option>
				<option value={15000}>15s</option>
			</select>
		</label>

		<button class="btn" onclick={() => (paused = !paused)}>
			{paused ? '▶ resume' : '⏸ pause'}
		</button>
		<button class="btn" onclick={reset}>reset view</button>
		<button class="btn btn-danger" onclick={clearBuffer}>clear buffer</button>
	</div>

	<div class="log-container">
		{#if visibleEntries.length === 0}
			<p class="empty">No entries match the current filter.</p>
		{:else}
			<table class="log-table">
				<thead>
					<tr>
						<th class="col-time">time</th>
						<th class="col-level">lvl</th>
						<th class="col-source">source</th>
						<th class="col-msg">message</th>
						<th class="col-meta">meta</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleEntries as e (e.seq)}
						<tr class="row-{e.level}">
							<td class="col-time mono">{fmtTime(e.ts)}</td>
							<td class="col-level"><span class="lvl lvl-{e.level}">{e.level}</span></td>
							<td class="col-source"><span class="src src-{e.source}">{e.source}</span></td>
							<td class="col-msg">{e.message}</td>
							<td class="col-meta mono">{fmtMeta(e.meta)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</section>

<style>
	.admin-page {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		font-family: var(--font-sans);
	}

	.admin-head {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		justify-content: space-between;
		align-items: flex-end;
	}

	.admin-head h1 {
		font-size: var(--text-2xl);
		font-weight: 700;
		margin: 0;
	}

	.hint {
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		margin: 0.125rem 0 0;
	}

	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.stat {
		padding: 0.25rem 0.625rem;
		font-size: var(--text-xs);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		color: var(--color-text-muted);
	}

	.stat b {
		color: var(--color-text);
	}

	.stat.tier b {
		color: #16a34a;
	}
	.stat.tier.warm b {
		color: #f59e0b;
	}
	.stat.tier.cold b {
		color: #64748b;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.625rem 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		align-items: end;
	}

	.toolbar label {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: 0;
	}

	.toolbar label.search {
		flex: 1;
		min-width: 180px;
	}

	.toolbar select,
	.toolbar input[type='text'] {
		font-size: var(--text-xs);
		padding: 0.25rem 0.5rem;
		margin: 0;
	}

	.btn {
		padding: 0.375rem 0.75rem;
		font-size: var(--text-xs);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		color: var(--color-text);
		font-family: inherit;
	}

	.btn:hover {
		background: var(--color-bg);
	}

	.btn-danger {
		color: #b91c1c;
		border-color: #fecaca;
	}

	.btn-danger:hover {
		background: #fef2f2;
	}

	.log-container {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: auto;
		max-height: 70vh;
	}

	.empty {
		padding: 2rem;
		text-align: center;
		color: var(--color-text-light);
		font-size: var(--text-sm);
	}

	.log-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-xs);
	}

	.log-table thead {
		position: sticky;
		top: 0;
		background: var(--color-bg);
		z-index: 1;
	}

	.log-table th {
		text-align: left;
		padding: 0.375rem 0.5rem;
		font-weight: 600;
		color: var(--color-text-muted);
		border-bottom: 1px solid var(--color-border);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.log-table td {
		padding: 0.25rem 0.5rem;
		border-bottom: 1px solid var(--color-bg);
		vertical-align: top;
	}

	.log-table tr:hover {
		background: var(--color-bg);
	}

	.mono {
		font-family: var(--font-mono);
	}

	.col-time { width: 90px; white-space: nowrap; color: var(--color-text-light); }
	.col-level { width: 55px; }
	.col-source { width: 80px; }
	.col-msg { min-width: 200px; }
	.col-meta { color: var(--color-text-muted); word-break: break-all; }

	.lvl {
		display: inline-block;
		padding: 0.05rem 0.3rem;
		border-radius: 2px;
		font-family: var(--font-mono);
		font-weight: 600;
		font-size: 0.65rem;
		text-transform: uppercase;
	}
	.lvl-debug { background: #f1f5f9; color: #64748b; }
	.lvl-info  { background: #dbeafe; color: #1e40af; }
	.lvl-warn  { background: #fef3c7; color: #78350f; }
	.lvl-error { background: #fee2e2; color: #991b1b; }

	.src {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-text-muted);
	}
	.src-api       { color: #4f46e5; }
	.src-store     { color: #16a34a; }
	.src-lifecycle { color: #0891b2; }
	.src-cache     { color: #d97706; }
	.src-seed      { color: #7c3aed; }
	.src-system    { color: #64748b; }

	.row-error { background: rgba(254, 226, 226, 0.4); }
	.row-warn  { background: rgba(254, 243, 199, 0.35); }
</style>
