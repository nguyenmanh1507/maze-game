<script lang="ts">
	import { onMount } from 'svelte'
	import type { Canvas } from 'fabric'
	import { Canvas as FabricCanvas } from 'fabric'
	import { createBlankGridMaze, type MazeModelV1 } from './maze-model'
	import { solveMazeDijkstra } from './maze-dijkstra-solver'
	import { renderRectangularMaze } from './maze-renderer'
	import { generateSidewinderMaze } from './maze-sidewinder-generator'

	let { maze }: { maze: MazeModelV1 } = $props()

	let canvasElement = $state<HTMLCanvasElement>()
	let fabricCanvas: Canvas | undefined
	// let fabric: MazeFabric | undefined
	let wallCount = $state(0)
	let errorMessage = $state('')
	let isReady = $state(false)

	function redrawMaze() {
		if (!fabricCanvas) return

		// renderMaze(fabricCanvas, fabric, maze)
		wallCount = Object.keys(maze.edges).length
	}

	onMount(() => {
		let disposed = false

		void (async () => {
			try {
				if (disposed) return
				if (!canvasElement) {
					errorMessage = 'The Fabric.js canvas could not be initialized.'
					return
				}

				fabricCanvas = new FabricCanvas(canvasElement, {
					backgroundColor: '#f0f0f0',
					selection: false
				})
				redrawMaze()
				isReady = true
			} catch {
				errorMessage = 'The Fabric.js canvas could not be loaded.'
			}
		})()

		if (!fabricCanvas) return

		const draft = createBlankGridMaze({
			rows: 10,
			columns: 10,
			boardRadius: 0.1,
			wallHeight: 0.012
		})

		const randomSeed = Math.floor(Math.random() * 100)
		const maze = generateSidewinderMaze(draft, { seed: randomSeed })
		const solution = solveMazeDijkstra(maze)

		renderRectangularMaze(fabricCanvas, maze, {
			showNodes: true,
			showPassages: true,
			nodeDebugRadius: 4,
			passageDebugWidth: 3,
			solutionNodeIds: solution.nodeIds
		})

		return () => {
			disposed = true
			void fabricCanvas?.dispose()
			fabricCanvas = undefined
		}
	})
</script>

<section class="space-y-4" aria-labelledby="fabric-demo-title">
	<h3>Sidewinder Maze</h3>

	{#if errorMessage}
		<p class="alert alert-error" role="alert">{errorMessage}</p>
	{:else}
		<div class="overflow-x-auto rounded-box border border-base-300 bg-base-200 p-3">
			<canvas bind:this={canvasElement} aria-label="Fabric.js maze canvas" width="600" height="600">
			</canvas>
		</div>

		<div class="flex flex-wrap items-center gap-3">
			<button class="btn" type="button" onclick={redrawMaze} disabled={!isReady}> Reset </button>
			<p role="status" aria-live="polite">
				{isReady ? `${wallCount} walls` : 'Loading canvas…'}
			</p>
		</div>
	{/if}
</section>
