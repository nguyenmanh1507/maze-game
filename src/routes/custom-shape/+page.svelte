<script lang="ts">
	import { Canvas as FabricCanvas } from 'fabric'
	import type { Canvas } from 'fabric'
	import { onMount } from 'svelte'
	import { solveMazeDijkstra } from '$lib/maze/maze-dijkstra-solver'
	import { generateRecursiveBacktrackerMaze } from '$lib/maze/maze-recursive-backtracker-generator'
	import { parseAsciiMazeMask } from '$lib/maze/maze-mask'
	import { createMaskedGridMaze, type MazeModelV1 } from '$lib/maze/maze-model'
	import { renderMaskedGridMaze } from '$lib/maze/maze-renderer'

	const DEFAULT_SHAPE = `
#######
#S....#
#.###.#
#.....#
#.###.#
#....G#
#######
`

	// Hand shape
	// #####G#######
	// ###.#.#.#####
	// #.#.#.#.#####
	// #.#.#.#.#####
	// .........####
	// ............#
	// .............
	// .........####
	// ###...#######
	// ###.S.#######

	// Oval "island" shape
	// ###.....###
	// ##.......##
	// #.........#
	// ...........
	// .S.......G.
	// ...........
	// #.........#
	// ##.......##
	// ###.....###

	// Eiffel tower
	// ########.########
	// ########.########
	// #######...#######
	// #######...#######
	// ######.....######
	// ######.....######
	// #####.......#####
	// #####.......#####
	// ####.........####
	// ####...###...####
	// ###....###....###
	// ##.....###.....##
	// #......###......#
	// ...S...###......G

	// Christmas tree
	// #######G#######
	// ######...######
	// #####.....#####
	// ####.......####
	// ###.........###
	// ##...........##
	// #.............#
	// ######...######
	// ######.S.######

	let asciiShape = $state(DEFAULT_SHAPE)
	let seedText = $state('')
	let canvasElement = $state<HTMLCanvasElement>()
	let fabricCanvas: Canvas | undefined
	let errorMessage = $state('')
	let generatedMaze = $state<MazeModelV1>()
	let generatedSeed = $state<number>()

	function generateMaze(): void {
		if (!fabricCanvas) return

		try {
			const parsed = parseAsciiMazeMask(asciiShape)
			const seed = parseSeed(seedText)
			const draft = createMaskedGridMaze({
				mask: parsed.mask,
				startCell: parsed.startCell,
				goalCell: parsed.goalCell,
				boardRadius: 0.1,
				wallHeight: 0.012
			})
			const maze = generateRecursiveBacktrackerMaze(draft, { seed })
			const solution = solveMazeDijkstra(maze)

			renderMaskedGridMaze(fabricCanvas, maze, {
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
	<title>Custom Shape Maze</title>
</svelte:head>

<main class="container mx-auto max-w-6xl p-5">
	<section class="mt-8 space-y-6">
		<div class="space-y-2">
			<h1 class="text-3xl font-bold">Custom Shape Maze</h1>
			<p class="max-w-2xl text-base-content/70">
				Define the maze silhouette with ASCII: <code>#</code> disables a cell, <code>.</code>
				enables one, and <code>S</code>/<code>G</code> set its start and goal.
			</p>
		</div>

		<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
			<form class="space-y-4" onsubmit={handleSubmit}>
				<label class="form-control gap-2" for="maze-ascii">
					<span class="label-text font-medium">ASCII shape</span>
					<textarea
						id="maze-ascii"
						class="textarea-bordered textarea h-80 w-full font-mono text-sm leading-5"
						bind:value={asciiShape}
						spellcheck="false"
						aria-describedby="maze-ascii-help"></textarea>
					<span id="maze-ascii-help" class="text-sm text-base-content/65">
						All non-blank rows must have the same length and enabled cells must connect in four
						directions.
					</span>
				</label>

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
					<canvas
						bind:this={canvasElement}
						aria-label="Custom shape maze canvas"
						width="600"
						height="600"
					></canvas>
				</div>

				<p role="status" aria-live="polite">
					{#if generatedMaze && generatedSeed !== undefined}
						{Object.keys(generatedMaze.nodes).length} cells · {Object.keys(generatedMaze.edges)
							.length}
						passages · seed {generatedSeed}
					{:else}
						Waiting for a valid shape.
					{/if}
				</p>
			</div>
		</div>
	</section>
</main>
