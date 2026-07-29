<script lang="ts">
	import { Canvas as FabricCanvas } from 'fabric'
	import type { Canvas } from 'fabric'
	import { onMount } from 'svelte'
	import {
		calculateMazeDistanceField,
		solveMazeDijkstra,
		type MazeDistanceField,
		type MazeSolution
	} from './maze-dijkstra-solver'
	import type { MazeGenerator } from './maze-generator'
	import { createBlankGridMaze, type MazeModelV1 } from './maze-model'
	import { renderRectangularMaze } from './maze-renderer'

	let { title, generateMaze }: { title: string; generateMaze: MazeGenerator } = $props()

	let canvasElement = $state<HTMLCanvasElement>()
	let fabricCanvas: Canvas | undefined
	let wallCount = $state(0)
	let deadEnd = $state(0)
	let errorMessage = $state('')
	let isReady = $state(false)
	let generatedMaze = $state<MazeModelV1>()
	let solution = $state<MazeSolution>()
	let distanceField = $state<MazeDistanceField>()
	let showDistanceHeatmap = $state(false)

	function redrawMaze() {
		if (!fabricCanvas || !generatedMaze || !solution || !distanceField) return

		wallCount = Object.keys(generatedMaze.edges).length
		deadEnd = countDeadEnds(generatedMaze)

		renderRectangularMaze(fabricCanvas, generatedMaze, {
			showNodes: true,
			showPassages: true,
			nodeDebugRadius: 4,
			passageDebugWidth: 3,
			distanceField: showDistanceHeatmap ? distanceField : undefined,
			solutionNodeIds: showDistanceHeatmap ? undefined : solution.nodeIds
		})
	}

	function countDeadEnds(maze: MazeModelV1): number {
		const degreeByNodeId: Record<string, number> = {}

		for (const nodeId of Object.keys(maze.nodes)) {
			degreeByNodeId[nodeId] = 0
		}

		for (const edge of Object.values(maze.edges)) {
			degreeByNodeId[edge.from] += 1
			degreeByNodeId[edge.to] += 1
		}

		return Object.values(degreeByNodeId).filter((degree) => degree === 1).length
	}

	function toggleDistanceHeatmap() {
		showDistanceHeatmap = !showDistanceHeatmap
		redrawMaze()
	}

	onMount(() => {
		try {
			if (!canvasElement) {
				errorMessage = 'The Fabric.js canvas could not be initialized.'
				return
			}

			fabricCanvas = new FabricCanvas(canvasElement, {
				backgroundColor: '#f0f0f0',
				selection: false
			})

			const draft = createBlankGridMaze({
				rows: 10,
				columns: 10,
				boardRadius: 0.1,
				wallHeight: 0.012
			})

			const randomSeed = Math.floor(Math.random() * 100)
			generatedMaze = generateMaze(draft, { seed: randomSeed })
			solution = solveMazeDijkstra(generatedMaze)
			distanceField = calculateMazeDistanceField(generatedMaze)
			isReady = true
			redrawMaze()
		} catch {
			errorMessage = 'The Fabric.js canvas could not be loaded.'
		}

		return () => {
			void fabricCanvas?.dispose()
			fabricCanvas = undefined
		}
	})
</script>

<section class="space-y-4">
	<h3>{title}</h3>

	{#if errorMessage}
		<p class="alert alert-error" role="alert">{errorMessage}</p>
	{:else}
		<div class="overflow-x-auto rounded-box border border-base-300 bg-base-200 p-3">
			<canvas bind:this={canvasElement} aria-label="Fabric.js maze canvas" width="600" height="600">
			</canvas>
		</div>

		<div class="flex flex-wrap items-center gap-3">
			<button class="btn" type="button" onclick={redrawMaze} disabled={!isReady}> Reset </button>
			<button
				class:btn-active={showDistanceHeatmap}
				class="btn"
				type="button"
				onclick={toggleDistanceHeatmap}
				aria-pressed={showDistanceHeatmap}
				disabled={!isReady}
			>
				Tô màu theo khoảng cách
			</button>
			<p role="status" aria-live="polite">
				{isReady
					? `${wallCount} walls · ${deadEnd} dead ends · ${showDistanceHeatmap ? 'Distance heatmap enabled' : 'Solution route enabled'}`
					: 'Loading canvas…'}
			</p>
		</div>
	{/if}
</section>
