<script lang="ts">
	import MazeDemo from './maze-demo.svelte'
	import { generateHuntAndKillMaze } from './maze-hunt-and-kill-generator'
</script>

<MazeDemo title="Hunt-and-Kill Maze" generateMaze={generateHuntAndKillMaze} />
