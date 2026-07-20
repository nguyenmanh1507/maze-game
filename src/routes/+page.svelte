<script lang="ts">
	import FabricDemo from '$lib/FabricDemo.svelte';
	import MainNav from '$lib/main-nav.svelte';
</script>

<MainNav />

<main class="container mx-auto p-5">
	<h1>Welcome to SvelteKit</h1>
	<p>
		Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation
	</p>

	<section class="mt-8">
		<FabricDemo />
	</section>
</main>
