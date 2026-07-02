<script lang="ts">
	import type { ActivityDay } from '$lib/stores/data';

	let { data, title = 'Activity', height = 80 }: { data: ActivityDay[]; title?: string; height?: number } = $props();

	// Use 7-day rolling average to smooth the stream
	let smoothed = $derived.by(() => {
		if (!data || data.length === 0) return [];
		const window = 5;
		const result: ActivityDay[] = [];
		for (let i = 0; i < data.length; i++) {
			let support = 0, reject = 0, neutral = 0, creates = 0, count = 0;
			let n = 0;
			for (let j = Math.max(0, i - Math.floor(window / 2)); j <= Math.min(data.length - 1, i + Math.floor(window / 2)); j++) {
				support += data[j].support;
				reject += data[j].reject;
				neutral += data[j].neutral;
				creates += data[j].creates;
				count += data[j].count;
				n++;
			}
			result.push({
				date: data[i].date,
				support: support / n,
				reject: reject / n,
				neutral: neutral / n,
				creates: creates / n,
				count: count / n
			});
		}
		return result;
	});

	// Layout
	const VIEW_WIDTH = 600;
	const PADDING_TOP = 4;
	const PADDING_BOTTOM = 4;

	let maxStack = $derived.by(() => {
		let m = 0;
		for (const d of smoothed) {
			const s = d.support + d.reject + d.neutral + d.creates;
			if (s > m) m = s;
		}
		return m || 1;
	});

	function bezierPath(points: { x: number; y: number }[]): string {
		if (points.length === 0) return '';
		if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
		let d = `M ${points[0].x},${points[0].y}`;
		for (let i = 0; i < points.length - 1; i++) {
			const p0 = points[i];
			const p1 = points[i + 1];
			const cx1 = p0.x + (p1.x - p0.x) / 2;
			const cy1 = p0.y;
			const cx2 = p0.x + (p1.x - p0.x) / 2;
			const cy2 = p1.y;
			d += ` C ${cx1},${cy1} ${cx2},${cy2} ${p1.x},${p1.y}`;
		}
		return d;
	}

	// Build streamgraph paths (centered around mid-line)
	let paths = $derived.by(() => {
		if (smoothed.length === 0) return null;
		const innerHeight = height - PADDING_TOP - PADDING_BOTTOM;
		const stepX = VIEW_WIDTH / Math.max(1, smoothed.length - 1);
		const scale = innerHeight / maxStack;

		const series: ('support' | 'creates' | 'neutral' | 'reject')[] = ['support', 'creates', 'neutral', 'reject'];
		const layers: { name: string; path: string; fill: string }[] = [];

		const colors: Record<string, string> = {
			support: 'rgba(134, 239, 172, 0.75)', // pastel green
			creates: 'rgba(196, 181, 253, 0.7)', // pastel purple
			neutral: 'rgba(203, 213, 225, 0.7)', // pastel gray
			reject: 'rgba(252, 165, 165, 0.75)' // pastel red
		};

		// Compute stacked y-values (offset around center)
		// Symmetric streamgraph: shift each day by -total/2 to center
		const lower: number[] = new Array(smoothed.length).fill(0);

		for (let s = 0; s < series.length; s++) {
			const seriesName = series[s];
			const top: { x: number; y: number }[] = [];
			const bottom: { x: number; y: number }[] = [];
			for (let i = 0; i < smoothed.length; i++) {
				const total = smoothed[i].support + smoothed[i].creates + smoothed[i].neutral + smoothed[i].reject;
				const offset = -total / 2; // center
				// stack up to this layer
				let prevSum = 0;
				for (let k = 0; k < s; k++) prevSum += smoothed[i][series[k]];
				const value = smoothed[i][seriesName];
				const yBottom = (offset + prevSum) * scale + innerHeight / 2 + PADDING_TOP;
				const yTop = (offset + prevSum + value) * scale + innerHeight / 2 + PADDING_TOP;
				const x = i * stepX;
				bottom.push({ x, y: yBottom });
				top.push({ x, y: yTop });
			}
			const topPath = bezierPath(top);
			const bottomReversed = [...bottom].reverse();
			const bottomPath = bezierPath(bottomReversed).replace(/^M /, 'L ');
			layers.push({
				name: seriesName,
				path: `${topPath} ${bottomPath} Z`,
				fill: colors[seriesName]
			});
		}
		return layers;
	});

	let totalEvents = $derived.by(() => (data ?? []).reduce((s, d) => s + d.count, 0));

	// Format earliest/latest date for label
	let dateRange = $derived.by(() => {
		if (!data || data.length === 0) return '';
		const first = new Date(data[0].date);
		const last = new Date(data[data.length - 1].date);
		const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
		return `${fmt(first)} – ${fmt(last)}`;
	});
</script>

<div class="activity-graph">
	<div class="activity-header">
		<span class="activity-title">{title}</span>
		<div class="activity-meta">
			<span class="legend-item"><span class="dot dot-support"></span>support</span>
			<span class="legend-item"><span class="dot dot-creates"></span>new</span>
			<span class="legend-item"><span class="dot dot-neutral"></span>neutral</span>
			<span class="legend-item"><span class="dot dot-reject"></span>reject</span>
		</div>
	</div>
	{#if paths}
		<svg
			viewBox="0 0 {VIEW_WIDTH} {height}"
			preserveAspectRatio="none"
			class="stream"
			style="height: {height}px"
			aria-label={title}
		>
			{#each paths as layer}
				<path d={layer.path} fill={layer.fill} stroke="none" />
			{/each}
		</svg>
	{/if}
	<div class="activity-footer">
		<span class="footer-text">{totalEvents} events</span>
		<span class="footer-text">{dateRange}</span>
	</div>
</div>

<style>
	.activity-graph {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.875rem 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.activity-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.activity-title {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text);
	}

	.activity-meta {
		display: flex;
		gap: 0.625rem;
		flex-wrap: wrap;
	}

	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: var(--text-xs);
		color: var(--color-text-light);
	}

	.dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}

	.dot-support { background: rgba(134, 239, 172, 0.85); }
	.dot-creates { background: rgba(196, 181, 253, 0.85); }
	.dot-neutral { background: rgba(203, 213, 225, 0.85); }
	.dot-reject { background: rgba(252, 165, 165, 0.85); }

	.stream {
		width: 100%;
		display: block;
	}

	.activity-footer {
		display: flex;
		justify-content: space-between;
		font-size: var(--text-xs);
		color: var(--color-text-light);
	}

	.footer-text {
		font-family: var(--font-mono);
	}
</style>
