<script lang="ts">
	import MainNav from '$lib/main-nav.svelte'
	import BinaryMazeDemo from '$lib/maze/binary-maze-demo.svelte'
	import SidewinderMaze from '$lib/maze/sidewinder-maze.svelte'
</script>

<svelte:head>
	<title>Maze</title>
</svelte:head>

<MainNav />

<main class="container mx-auto p-5">
	<section class="mt-8 flex flex-col items-center justify-center gap-y-5">
		<BinaryMazeDemo />
		<SidewinderMaze />
	</section>
</main>
