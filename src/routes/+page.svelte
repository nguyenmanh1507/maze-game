<script lang="ts">
	import BinaryMazeDemo from '$lib/maze/binary-maze-demo.svelte'
	import HuntAndKillMaze from '$lib/maze/hunt-and-kill-maze.svelte'
	import RecursiveBacktrackerMaze from '$lib/maze/recursive-backtracker-maze.svelte'
	import SidewinderMaze from '$lib/maze/sidewinder-maze.svelte'
	import WilsonMaze from '$lib/maze/wilson-maze.svelte'
</script>

<svelte:head>
	<title>Maze</title>
</svelte:head>

<main class="container mx-auto p-5">
	<section class="mt-8 flex flex-col items-center justify-center gap-y-5">
		<BinaryMazeDemo />
		<SidewinderMaze />
		<WilsonMaze />
		<HuntAndKillMaze />
		<RecursiveBacktrackerMaze />
	</section>
</main>
