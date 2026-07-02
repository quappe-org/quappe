<script lang="ts">
	let { size = 28 }: { size?: number } = $props();
</script>

<img
	src="/quappe.png"
	alt="Quappe logo"
	width={size}
	height={size}
	class="logo"
	style="width: {size}px; height: {size}px;"
/>

<style>
	.logo {
		display: block;
		object-fit: contain;
	}
</style>
