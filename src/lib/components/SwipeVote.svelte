<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { VoteType } from '$lib/models/types';
	import { onMount } from 'svelte';

	interface Props {
		children: Snippet;
		oncast?: (type: VoteType, weight: number) => void;
		enabled?: boolean;
	}

	let { children, oncast, enabled = true }: Props = $props();

	let root = $state<HTMLElement | null>(null);
	let dx = $state(0);
	let dragging = $state(false);
	let isTouch = $state(false);
	let startX = 0;
	let startY = 0;
	let lastTapAt = 0;
	let lastTapX = 0;
	let lastTapY = 0;
	let pointerActive = false;
	let axisLocked: 'x' | 'y' | null = null;

	const SWIPE_THRESHOLD = 60;
	const DOUBLE_TAP_MS = 300;
	const TAP_MAX_MOVE = 10;

	onMount(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(pointer: coarse)');
		isTouch = mq.matches;
		const listener = (e: MediaQueryListEvent) => (isTouch = e.matches);
		mq.addEventListener?.('change', listener);
		return () => mq.removeEventListener?.('change', listener);
	});

	function onPointerDown(e: PointerEvent) {
		if (!enabled || !isTouch || e.pointerType === 'mouse') return;
		pointerActive = true;
		startX = e.clientX;
		startY = e.clientY;
		dx = 0;
		axisLocked = null;
	}

	function onPointerMove(e: PointerEvent) {
		if (!pointerActive || !isTouch) return;
		const rawDx = e.clientX - startX;
		const rawDy = e.clientY - startY;

		if (!axisLocked) {
			// Wait for meaningful motion before deciding axis
			if (Math.abs(rawDx) < 6 && Math.abs(rawDy) < 6) return;
			// Horizontal wins only if clearly dominant — otherwise let scroll happen
			if (Math.abs(rawDx) > Math.abs(rawDy) * 1.5) {
				axisLocked = 'x';
				dragging = true;
			} else {
				axisLocked = 'y';
				pointerActive = false; // release: user is scrolling
				return;
			}
		}
		if (axisLocked !== 'x') return;
		e.preventDefault();
		dx = rawDx;
	}

	function onPointerUp(e: PointerEvent) {
		if (!isTouch) return;
		const wasDragging = dragging;
		const finalDx = dx;
		pointerActive = false;
		dragging = false;
		dx = 0;

		// Swipe cast
		if (wasDragging && Math.abs(finalDx) >= SWIPE_THRESHOLD && oncast) {
			oncast(finalDx > 0 ? 'support' : 'reject', 1);
			lastTapAt = 0;
			return;
		}

		// Double-tap → neutral (only if pointer barely moved)
		if (!wasDragging && Math.abs(e.clientX - startX) < TAP_MAX_MOVE && Math.abs(e.clientY - startY) < TAP_MAX_MOVE) {
			const now = performance.now();
			if (
				now - lastTapAt < DOUBLE_TAP_MS &&
				Math.abs(e.clientX - lastTapX) < TAP_MAX_MOVE &&
				Math.abs(e.clientY - lastTapY) < TAP_MAX_MOVE
			) {
				oncast?.('neutral', 1);
				lastTapAt = 0;
			} else {
				lastTapAt = now;
				lastTapX = e.clientX;
				lastTapY = e.clientY;
			}
		}
	}

	function onPointerCancel() {
		pointerActive = false;
		dragging = false;
		dx = 0;
	}

	let tintOpacity = $derived(Math.min(0.35, Math.abs(dx) / 300));
	let tintColor = $derived(
		dx > 0 ? 'var(--color-support)' : dx < 0 ? 'var(--color-reject)' : 'transparent'
	);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="swipe-vote"
	class:swipe-active={dragging}
	bind:this={root}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerCancel}
	style="--dx: {dx}px; --tint-opacity: {tintOpacity}; --tint-color: {tintColor}"
>
	{@render children()}
	{#if dragging && Math.abs(dx) > 20}
		<div class="swipe-overlay" aria-hidden="true">
			<span class="swipe-label" style="color: {tintColor}">
				{#if dx > 0}✓ support{:else}✗ reject{/if}
			</span>
		</div>
	{/if}
</div>

<style>
	.swipe-vote {
		position: relative;
		touch-action: pan-y;
	}

	.swipe-active {
		transform: translateX(var(--dx));
		transition: transform 0.02s linear;
	}

	.swipe-vote:not(.swipe-active) {
		transition: transform 0.18s ease-out;
		transform: translateX(0);
	}

	.swipe-vote::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: var(--tint-color);
		opacity: var(--tint-opacity, 0);
		pointer-events: none;
		transition: opacity 0.1s;
	}

	.swipe-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		font-weight: 700;
		font-size: 1.1rem;
	}

	.swipe-label {
		background: rgba(255, 255, 255, 0.92);
		padding: 0.35rem 0.75rem;
		border-radius: 999px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}
</style>
