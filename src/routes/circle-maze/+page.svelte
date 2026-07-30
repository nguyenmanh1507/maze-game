<script lang="ts">
	import { Canvas as FabricCanvas } from 'fabric'
	import type { Canvas } from 'fabric'
	import { onMount } from 'svelte'
	import { solveMazeDijkstra } from '$lib/maze/maze-dijkstra-solver'
	import { generateRecursiveBacktrackerMaze } from '$lib/maze/maze-recursive-backtracker-generator'
	import type { MazeModelV1 } from '$lib/maze/maze-model'
	import { createPolarMaze } from '$lib/maze/polar-maze'
	import { renderPolarMaze } from '$lib/maze/polar-maze-renderer'

	let ringsText = $state('12')
	let seedText = $state('')
	let canvasElement = $state<HTMLCanvasElement>()
	let fabricCanvas: Canvas | undefined
	let errorMessage = $state('')
	let generatedMaze = $state<MazeModelV1>()
	let generatedSeed = $state<number>()

	function generateMaze(): void {
		if (!fabricCanvas) return

		try {
			const rings = parseRingCount(ringsText)
			const seed = parseSeed(seedText)
			const draft = createPolarMaze({ rings, boardRadius: 0.1, wallHeight: 0.012 })
			const maze = generateRecursiveBacktrackerMaze(draft, { seed })
			const solution = solveMazeDijkstra(maze)
			const entranceNodeId = draft.polarLayout.rings.at(-1)?.[0]

			renderPolarMaze(fabricCanvas, maze, {
				entranceNodeId,
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

	function parseRingCount(value: string | number): number {
		const rings = Number(value)

		if (!Number.isInteger(rings) || rings < 2 || rings > 30) {
			throw new Error('Ring count must be between 2 and 30.')
		}

		return rings
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
	<title>Circle Maze</title>
</svelte:head>

<main class="container mx-auto max-w-6xl p-5">
	<section class="mt-8 space-y-6">
		<div class="space-y-2">
			<h1 class="text-3xl font-bold">Circle Maze</h1>
			<p class="max-w-2xl text-base-content/70">
				Generate a theta maze with adaptive concentric rings. The entrance begins on the outer ring
				and the goal is at the center.
			</p>
		</div>

		<div class="grid gap-6 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)]">
			<form class="flex flex-col space-y-4" novalidate onsubmit={handleSubmit}>
				<label class="form-control max-w-xs gap-2" for="maze-rings">
					<span class="label-text font-medium">Number of rings</span>
					<input
						id="maze-rings"
						class="input-bordered input"
						type="number"
						min="2"
						max="30"
						step="1"
						bind:value={ringsText}
						aria-describedby="maze-rings-help"
					/>
					<span id="maze-rings-help" class="text-sm text-base-content/65">
						Choose between 2 and 30 rings.
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
					<canvas bind:this={canvasElement} aria-label="Circle maze canvas" width="600" height="600"
					></canvas>
				</div>

				<p role="status" aria-live="polite">
					{#if generatedMaze && generatedSeed !== undefined}
						{Object.keys(generatedMaze.nodes).length} cells · {Object.keys(generatedMaze.edges)
							.length} passages · seed {generatedSeed}
					{:else}
						Waiting for a valid ring count.
					{/if}
				</p>
			</div>
		</div>
	</section>
</main>
