<script lang="ts">
	import MazeDemo from './maze-demo.svelte'
	import { generateBinaryTreeMaze } from './maze-binary-tree-generator'
</script>

<MazeDemo title="Binary Tree Maze" generateMaze={generateBinaryTreeMaze} />
