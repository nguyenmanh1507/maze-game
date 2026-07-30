<script lang="ts">
	import { Canvas as FabricCanvas } from 'fabric'
	import type { Canvas } from 'fabric'
	import { onMount } from 'svelte'
	import { solveMazeDijkstra } from '$lib/maze/maze-dijkstra-solver'
	import { generateRecursiveBacktrackerMaze } from '$lib/maze/maze-recursive-backtracker-generator'
	import { createHexMaze } from '$lib/maze/hex-maze'
	import { renderHexMaze } from '$lib/maze/hex-maze-renderer'
	import type { MazeModelV1 } from '$lib/maze/maze-model'

	let rowsText = $state('10')
	let columnsText = $state('10')
	let seedText = $state('')
	let canvasElement = $state<HTMLCanvasElement>()
	let fabricCanvas: Canvas | undefined
	let errorMessage = $state('')
	let generatedMaze = $state<MazeModelV1>()
	let generatedSeed = $state<number>()

	function generateMaze(): void {
		if (!fabricCanvas) return

		try {
			const rows = parseDimension(rowsText, 'Row count')
			const columns = parseDimension(columnsText, 'Column count')
			const seed = parseSeed(seedText)
			const draft = createHexMaze({ rows, columns, boardRadius: 0.1, wallHeight: 0.012 })
			const maze = generateRecursiveBacktrackerMaze(draft, { seed })
			const solution = solveMazeDijkstra(maze)

			renderHexMaze(fabricCanvas, maze, {
				solutionNodeIds: solution.status === 'solved' ? solution.nodeIds : undefined
			})

			generatedMaze = maze
			generatedSeed = seed
			seedText = String(seed)
			errorMessage = ''
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Maze generation failed.'
		}
	}

	function parseDimension(value: string | number, label: string): number {
		const dimension = Number(value)

		if (!Number.isInteger(dimension) || dimension < 2 || dimension > 30) {
			throw new Error(`${label} must be between 2 and 30.`)
		}

		return dimension
	}

	function parseSeed(value: string): number {
		if (value.trim() === '') {
			return Math.floor(Math.random() * 4_294_967_296)
		}

		const seed = Number(value)

		if (!Number.isSafeInteger(seed)) {
			throw new Error('Seed must be a whole number.')
		}

		return seed
	}

	function handleSubmit(event: SubmitEvent): void {
		event.preventDefault()
		generateMaze()
	}

	onMount(() => {
		if (!canvasElement) {
			errorMessage = 'The Fabric.js canvas could not be initialized.'
			return
		}

		fabricCanvas = new FabricCanvas(canvasElement, {
			backgroundColor: '#f0f0f0',
			selection: false
		})
		generateMaze()

		return () => {
			void fabricCanvas?.dispose()
			fabricCanvas = undefined
		}
	})
</script>

<svelte:head>
	<title>Hexa Maze</title>
</svelte:head>

<main class="container mx-auto max-w-6xl p-5">
	<section class="mt-8 space-y-6">
		<div class="space-y-2">
			<h1 class="text-3xl font-bold">Hexa Maze</h1>
			<p class="max-w-2xl text-base-content/70">
				Generate a sigma maze on a staggered grid of regular hexagons. Each cell can connect in up
				to six directions.
			</p>
		</div>

		<div class="grid gap-6 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)]">
			<form class="flex flex-col space-y-4" novalidate onsubmit={handleSubmit}>
				<div class="flex flex-wrap gap-4">
					<label class="form-control max-w-xs gap-2" for="maze-rows">
						<span class="label-text font-medium">Rows</span>
						<input
							id="maze-rows"
							class="input-bordered input"
							type="number"
							min="2"
							max="30"
							step="1"
							bind:value={rowsText}
							aria-describedby="maze-dimensions-help"
						/>
					</label>

					<label class="form-control max-w-xs gap-2" for="maze-columns">
						<span class="label-text font-medium">Columns</span>
						<input
							id="maze-columns"
							class="input-bordered input"
							type="number"
							min="2"
							max="30"
							step="1"
							bind:value={columnsText}
							aria-describedby="maze-dimensions-help"
						/>
					</label>
				</div>

				<span id="maze-dimensions-help" class="text-sm text-base-content/65">
					Choose between 2 and 30 rows and columns.
				</span>

				<label class="form-control max-w-xs gap-2" for="maze-seed">
					<span class="label-text font-medium">Seed</span>
					<input
						id="maze-seed"
						class="input-bordered input"
						type="text"
						inputmode="numeric"
						bind:value={seedText}
						placeholder="Random seed"
					/>
				</label>

				<button class="btn btn-primary" type="submit">Generate maze</button>

				{#if errorMessage}
					<p class="alert alert-error" role="alert">{errorMessage}</p>
				{/if}
			</form>

			<div class="space-y-3">
				<div class="overflow-x-auto rounded-box border border-base-300 bg-base-200 p-3">
					<canvas bind:this={canvasElement} aria-label="Hexa maze canvas" width="600" height="600"
					></canvas>
				</div>

				<p role="status" aria-live="polite">
					{#if generatedMaze && generatedSeed !== undefined}
						{Object.keys(generatedMaze.nodes).length} cells · {Object.keys(generatedMaze.edges)
							.length} passages · seed {generatedSeed}
					{:else}
						Waiting for valid dimensions.
					{/if}
				</p>
			</div>
		</div>
	</section>
</main>
