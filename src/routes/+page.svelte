<script lang="ts">
	import MainNav from '$lib/main-nav.svelte'
	import FabricDemo from '$lib/maze/fabric-demo.svelte'
	import { maze1 } from '$lib/maze/maze-sample'
</script>

<MainNav />

<main class="container mx-auto p-5">
	<section class="mt-8 flex justify-center">
		<FabricDemo maze={maze1} />
	</section>
</main>
