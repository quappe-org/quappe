<script lang="ts">
	import type { Argument } from '$lib/models/types';
	import { onMount, tick } from 'svelte';

	let { arguments: args, container }: { arguments: Argument[]; container: HTMLElement | null } = $props();

	interface Line {
		x1: number;
		y1: number;
		x2: number;
		y2: number;
	}

	let lines = $state<Line[]>([]);
	let svgWidth = $state(0);
	let svgHeight = $state(0);

	function computeLines() {
		if (!container) return;
		const containerRect = container.getBoundingClientRect();
		svgWidth = containerRect.width;
		svgHeight = containerRect.height;

		const newLines: Line[] = [];
		for (const arg of args) {
			if (!arg.forked_from_id) continue;
			const child = container.querySelector<HTMLElement>(`[data-arg-id="${arg.id}"]`);
			const parent = container.querySelector<HTMLElement>(`[data-arg-id="${arg.forked_from_id}"]`);
			if (!child || !parent) continue;

			const childRect = child.getBoundingClientRect();
			const parentRect = parent.getBoundingClientRect();

			// Anchor: parent bottom-left, child top-left (both slightly inside)
			const x1 = parentRect.left - containerRect.left + 4;
			const y1 = parentRect.bottom - containerRect.top;
			const x2 = childRect.left - containerRect.left + 4;
			const y2 = childRect.top - containerRect.top;

			newLines.push({ x1, y1, x2, y2 });
		}
		lines = newLines;
	}

	async function refresh() {
		await tick();
		computeLines();
	}

	// Re-compute whenever args or container changes
	$effect(() => {
		void args;
		void container;
		refresh();
	});

	onMount(() => {
		refresh();
		const ro = new ResizeObserver(refresh);
		if (container) ro.observe(container);
		window.addEventListener('resize', refresh);
		return () => {
			ro.disconnect();
			window.removeEventListener('resize', refresh);
		};
	});

	function pathFor(line: Line): string {
		// Vertical S-curve going down-left along the edge
		const midY = (line.y1 + line.y2) / 2;
		const cx1 = line.x1;
		const cy1 = midY;
		const cx2 = line.x2;
		const cy2 = midY;
		return `M ${line.x1},${line.y1} C ${cx1},${cy1} ${cx2},${cy2} ${line.x2},${line.y2}`;
	}
</script>

<svg class="fork-lines" width={svgWidth} height={svgHeight} aria-hidden="true">
	{#each lines as line, i}
		<path d={pathFor(line)} class="fork-line" />
	{/each}
</svg>

<style>
	.fork-lines {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
		overflow: visible;
		z-index: 0;
	}

	.fork-line {
		fill: none;
		stroke: #dc2626;
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-dasharray: 4 3;
		opacity: 0.55;
	}
</style>
