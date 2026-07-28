<script lang="ts">
	import MazeDemo from './maze-demo.svelte'
	import { generateWilsonMaze } from './maze-wilson-generator'
</script>

<MazeDemo title="Wilson Maze" generateMaze={generateWilsonMaze} />
