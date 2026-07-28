<script lang="ts">
	import MazeDemo from './maze-demo.svelte'
	import { generateSidewinderMaze } from './maze-sidewinder-generator'
</script>

<MazeDemo title="Sidewinder Maze" generateMaze={generateSidewinderMaze} />
