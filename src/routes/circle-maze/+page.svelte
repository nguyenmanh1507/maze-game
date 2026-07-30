<script lang="ts">
	import { Canvas as FabricCanvas } from 'fabric'
	import type { Canvas } from 'fabric'
	import { onMount } from 'svelte'
	import { braidMaze, type BraidMazeResult } from '$lib/maze/maze-braid-generator'
	import { solveMazeDijkstra } from '$lib/maze/maze-dijkstra-solver'
	import { generateRecursiveBacktrackerMaze } from '$lib/maze/maze-recursive-backtracker-generator'
	import { createPolarMaze } from '$lib/maze/polar-maze'
	import { renderPolarMaze } from '$lib/maze/polar-maze-renderer'

	const BRAID_SEED_SALT = 0x9e3779b9

	let ringsText = $state('12')
	let ratioText = $state('40')
	let seedText = $state('')
	let canvasElement = $state<HTMLCanvasElement>()
	let fabricCanvas: Canvas | undefined
	let errorMessage = $state('')
	let generatedResult = $state<BraidMazeResult>()
	let generatedSeed = $state<number>()

	function generateMaze(): void {
		if (!fabricCanvas) return

		try {
			const rings = parseRingCount(ringsText)
			const ratioPercent = parseRatio(ratioText)
			const seed = parseSeed(seedText)
			const draft = createPolarMaze({ rings, boardRadius: 0.1, wallHeight: 0.012 })
			const perfectMaze = generateRecursiveBacktrackerMaze(draft, { seed })
			const entranceNodeId = getRequiredNodeId(draft.polarLayout.rings.at(-1)?.[0])
			const goalNodeId = getRequiredNodeId(draft.polarLayout.rings[0]?.[0])
			const result = braidMaze(perfectMaze, draft.topology, {
				ratio: ratioPercent / 100,
				seed: seed ^ BRAID_SEED_SALT,
				preferDeadEndNeighbors: true,
				preferStraight: true,
				minCycleLength: 8,
				protectedNodeIds: new Set([entranceNodeId, goalNodeId])
			})
			const solution = solveMazeDijkstra(result.model)

			renderPolarMaze(fabricCanvas, result.model, {
				entranceNodeId,
				solutionNodeIds: solution.status === 'solved' ? solution.nodeIds : undefined
			})

			generatedResult = result
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

	function parseRatio(value: string | number): number {
		const ratio = Number(value)

		if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) {
			throw new Error('Braid ratio must be between 0 and 100.')
		}

		return ratio
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

	function getRequiredNodeId(nodeId: string | undefined): string {
		if (!nodeId) throw new Error('Polar maze endpoint is missing.')
		return nodeId
	}

	function formatStatus(result: BraidMazeResult, seed: number): string {
		return `${Object.keys(result.model.nodes).length} cells · ${Object.keys(result.model.edges).length} passages · dead ends ${result.initialDeadEndCount} → ${result.finalDeadEndCount} · removed ${result.actualRemovedCount}/${result.targetRemovedCount} · ${result.addedEdgeIds.length} loops · seed ${seed}`
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

				<label class="form-control max-w-xs gap-2" for="braid-ratio">
					<span class="label-text font-medium">Braid ratio (%)</span>
					<input
						id="braid-ratio"
						class="input-bordered input"
						type="number"
						min="0"
						max="100"
						step="5"
						bind:value={ratioText}
						aria-describedby="braid-ratio-help"
					/>
					<span id="braid-ratio-help" class="text-sm text-base-content/65">
						Target percentage of eligible dead ends to remove.
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
					{#if generatedResult && generatedSeed !== undefined}
						{formatStatus(generatedResult, generatedSeed)}
					{:else}
						Waiting for valid polar braid settings.
					{/if}
				</p>
			</div>
		</div>
	</section>
</main>
