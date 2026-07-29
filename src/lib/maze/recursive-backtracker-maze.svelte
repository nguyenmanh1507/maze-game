<script lang="ts">
	import MazeDemo from './maze-demo.svelte'
	import { generateRecursiveBacktrackerMaze } from './maze-recursive-backtracker-generator'
</script>

<MazeDemo title="Recursive Backtracker Maze" generateMaze={generateRecursiveBacktrackerMaze} />
