<script lang="ts">
	import { resolve } from '$app/paths'
	import { onMount } from 'svelte'
	import type { LabyrinthGame, LabyrinthGameStatus } from '$lib/labyrinth/labyrinth-game'
	import { buildLabyrinthLayout, type LabyrinthLayout } from '$lib/labyrinth/labyrinth-layout'
	import {
		DEFAULT_LABYRINTH_TUNING,
		LABYRINTH_FIXED_TIMESTEP,
		type LabyrinthEngineId
	} from '$lib/labyrinth/labyrinth-physics'
	import { braidMaze } from '$lib/maze/maze-braid-generator'
	import { solveMazeDijkstra } from '$lib/maze/maze-dijkstra-solver'
	import { createBlankGridMaze } from '$lib/maze/maze-model'
	import { generateRecursiveBacktrackerMaze } from '$lib/maze/maze-recursive-backtracker-generator'

	const BRAID_SEED_SALT = 0x9e3779b9
	const TRAP_SEED_SALT = 0x85ebca6b
	const PHYSICS_HZ = Math.round(1 / LABYRINTH_FIXED_TIMESTEP)

	const ENGINES = {
		rapier: { label: 'Rapier', route: '/labyrinth' },
		jolt: { label: 'Jolt', route: '/labyrinth-jolt' }
	} as const

	interface GeneratedSettings {
		rows: number
		columns: number
		ratioPercent: number
		trapHoleCount: number
		seed: number
	}

	let { engine }: { engine: LabyrinthEngineId } = $props()

	const engineLabel = $derived(ENGINES[engine].label)
	const otherEngine = $derived<LabyrinthEngineId>(engine === 'rapier' ? 'jolt' : 'rapier')

	type PermissionAwareOrientationEvent = typeof DeviceOrientationEvent & {
		requestPermission?: () => Promise<'granted' | 'denied'>
	}

	let rowsText = $state('8')
	let columnsText = $state('8')
	let ratioText = $state('40')
	let trapHolesText = $state('4')
	let seedText = $state('')
	let maxTiltDegrees = $state(DEFAULT_LABYRINTH_TUNING.maxTiltDegrees)
	let rollingResistance = $state(DEFAULT_LABYRINTH_TUNING.rollingResistance)
	let wallBounce = $state(DEFAULT_LABYRINTH_TUNING.wallBounce)

	let boardElement = $state<HTMLDivElement>()
	let game = $state.raw<LabyrinthGame>()
	let layout = $state.raw<LabyrinthLayout>()
	let generated = $state<GeneratedSettings>()
	let status = $state<LabyrinthGameStatus>({
		phase: 'ready',
		elapsedSeconds: 0,
		falls: 0,
		physicsStepMs: 0
	})
	let errorMessage = $state('')
	let loadingGame = $state(true)
	let deviceTiltSupported = $state(false)
	let deviceTiltEnabled = $state(false)

	$effect(() => {
		game?.setTuning({ maxTiltDegrees, rollingResistance, wallBounce })
	})

	function generateLevel(): void {
		try {
			const rows = parseDimension(rowsText, 'Row count')
			const columns = parseDimension(columnsText, 'Column count')
			const ratioPercent = parseRatio(ratioText)
			const trapHoleCount = parseTrapHoleCount(trapHolesText)
			const seed = parseSeed(seedText)
			const draft = createBlankGridMaze({ rows, columns })
			const perfectMaze = generateRecursiveBacktrackerMaze(draft, { seed })
			const startNodeId = getRequiredCellId(draft.layout.cells[rows - 1][0])
			const goalNodeId = getRequiredCellId(draft.layout.cells[0][columns - 1])
			const braided = braidMaze(perfectMaze, draft.topology, {
				ratio: ratioPercent / 100,
				seed: seed ^ BRAID_SEED_SALT,
				preferDeadEndNeighbors: true,
				preferStraight: true,
				minCycleLength: 8,
				protectedNodeIds: new Set([startNodeId, goalNodeId])
			})
			const solution = solveMazeDijkstra(braided.model)

			if (solution.status !== 'solved') {
				throw new Error('Generated maze has no path from start to goal.')
			}

			const nextLayout = buildLabyrinthLayout(
				{ layout: draft.layout, model: braided.model, solutionNodeIds: solution.nodeIds },
				{ trapHoleCount, seed: seed ^ TRAP_SEED_SALT }
			)

			layout = nextLayout
			generated = { rows, columns, ratioPercent, trapHoleCount, seed }
			seedText = String(seed)
			errorMessage = ''
			game?.loadLevel(nextLayout)
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Labyrinth generation failed.'
		}
	}

	function parseDimension(value: string | number, label: string): number {
		const dimension = Number(value)

		if (!Number.isInteger(dimension) || dimension < 2 || dimension > 20) {
			throw new Error(`${label} must be between 2 and 20.`)
		}

		return dimension
	}

	function parseRatio(value: string | number): number {
		const ratio = Number(value)

		if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) {
			throw new Error('Braid ratio must be between 0 and 100.')
		}

		return ratio
	}

	function parseTrapHoleCount(value: string | number): number {
		const count = Number(value)

		if (!Number.isInteger(count) || count < 0 || count > 40) {
			throw new Error('Trap holes must be between 0 and 40.')
		}

		return count
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

	/** Cho phép mở cùng một maze ở trang engine khác qua query string. */
	function readSettingsFromUrl(): void {
		const params = new URLSearchParams(window.location.search)

		rowsText = params.get('rows') ?? rowsText
		columnsText = params.get('columns') ?? columnsText
		ratioText = params.get('ratio') ?? ratioText
		trapHolesText = params.get('traps') ?? trapHolesText
		seedText = params.get('seed') ?? seedText
	}

	function toSearchParams(settings: GeneratedSettings): string {
		return new URLSearchParams({
			rows: String(settings.rows),
			columns: String(settings.columns),
			ratio: String(settings.ratioPercent),
			traps: String(settings.trapHoleCount),
			seed: String(settings.seed)
		}).toString()
	}

	function getRequiredCellId(nodeId: string | undefined): string {
		if (!nodeId) throw new Error('Labyrinth endpoint is missing.')
		return nodeId
	}

	function handleSubmit(event: SubmitEvent): void {
		event.preventDefault()
		generateLevel()
	}

	function handleNewMaze(): void {
		seedText = ''
		generateLevel()
	}

	async function toggleDeviceTilt(): Promise<void> {
		if (!game) return

		if (deviceTiltEnabled) {
			game.disableDeviceTilt()
			deviceTiltEnabled = false
			return
		}

		const orientationEvent = DeviceOrientationEvent as PermissionAwareOrientationEvent

		try {
			if (typeof orientationEvent.requestPermission === 'function') {
				const permission = await orientationEvent.requestPermission()
				if (permission !== 'granted') throw new Error('Motion sensor permission was denied.')
			}

			game.enableDeviceTilt()
			deviceTiltEnabled = true
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Device tilt is unavailable.'
		}
	}

	function formatSeconds(seconds: number): string {
		return `${seconds.toFixed(1)} s`
	}

	function formatStatus(current: LabyrinthGameStatus): string {
		const stats = `${formatSeconds(current.elapsedSeconds)} · falls ${current.falls}`

		switch (current.phase) {
			case 'ready':
				return 'Tilt the board to start.'
			case 'playing':
				return `Rolling… ${stats}`
			case 'falling':
				return `Dropped into a hole! ${stats}`
			case 'won':
				return `Goal! ${stats}`
		}
	}

	onMount(() => {
		let disposed = false
		let createdGame: LabyrinthGame | undefined

		deviceTiltSupported =
			'DeviceOrientationEvent' in window && window.matchMedia('(pointer: coarse)').matches
		readSettingsFromUrl()
		generateLevel()

		const container = boardElement
		if (!container) {
			errorMessage = 'The game board could not be initialized.'
			loadingGame = false
			return
		}

		void import('$lib/labyrinth/labyrinth-game')
			.then(({ createLabyrinthGame }) =>
				createLabyrinthGame(container, {
					engine,
					onStatus: (next) => (status = next),
					tuning: { maxTiltDegrees, rollingResistance, wallBounce }
				})
			)
			.then((created) => {
				if (disposed) {
					created.dispose()
					return
				}

				createdGame = created
				game = created
				if (layout) created.loadLevel(layout)
			})
			.catch((error: unknown) => {
				errorMessage = error instanceof Error ? error.message : 'The 3D game failed to start.'
			})
			.finally(() => {
				loadingGame = false
			})

		return () => {
			disposed = true
			createdGame?.dispose()
			game = undefined
		}
	})
</script>

<svelte:head>
	<title>Labyrinth · {engineLabel}</title>
</svelte:head>

<main class="container mx-auto max-w-7xl p-5">
	<section class="mt-8 space-y-6">
		<div class="space-y-2">
			<h1 class="flex items-center gap-3 text-3xl font-bold">
				Labyrinth
				<span class="badge badge-lg badge-primary">{engineLabel} physics</span>
			</h1>
			<p class="max-w-2xl text-base-content/70">
				Tilt the wooden board to roll the steel ball from the blue start ring to the green goal
				hole. The maze is a braided recursive-backtracker maze, so there's more than one route.
			</p>
			{#if generated}
				<a
					class="link link-primary"
					href="{resolve(ENGINES[otherEngine].route)}?{toSearchParams(generated)}"
				>
					Play this exact maze with {ENGINES[otherEngine].label} physics →
				</a>
			{/if}
		</div>

		<div class="grid gap-6 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,1.45fr)]">
			<div class="flex flex-col gap-6">
				<form class="flex flex-col space-y-4" novalidate onsubmit={handleSubmit}>
					<div class="flex flex-wrap gap-4">
						<label class="form-control max-w-28 gap-2" for="labyrinth-rows">
							<span class="label-text font-medium">Rows</span>
							<input
								id="labyrinth-rows"
								class="input-bordered input"
								type="number"
								min="2"
								max="20"
								step="1"
								bind:value={rowsText}
							/>
						</label>

						<label class="form-control max-w-28 gap-2" for="labyrinth-columns">
							<span class="label-text font-medium">Columns</span>
							<input
								id="labyrinth-columns"
								class="input-bordered input"
								type="number"
								min="2"
								max="20"
								step="1"
								bind:value={columnsText}
							/>
						</label>
					</div>

					<div class="flex flex-wrap gap-4">
						<label class="form-control max-w-28 gap-2" for="labyrinth-braid-ratio">
							<span class="label-text font-medium">Braid ratio (%)</span>
							<input
								id="labyrinth-braid-ratio"
								class="input-bordered input"
								type="number"
								min="0"
								max="100"
								step="5"
								bind:value={ratioText}
							/>
						</label>

						<label class="form-control max-w-28 gap-2" for="labyrinth-trap-holes">
							<span class="label-text font-medium">Trap holes</span>
							<input
								id="labyrinth-trap-holes"
								class="input-bordered input"
								type="number"
								min="0"
								max="40"
								step="1"
								bind:value={trapHolesText}
							/>
						</label>
					</div>

					<label class="form-control max-w-xs gap-2" for="labyrinth-seed">
						<span class="label-text font-medium">Seed</span>
						<input
							id="labyrinth-seed"
							class="input-bordered input"
							type="text"
							inputmode="numeric"
							bind:value={seedText}
							placeholder="Random seed"
						/>
					</label>

					<div class="flex flex-wrap gap-2">
						<button class="btn btn-primary" type="submit">Build maze</button>
						<button class="btn" type="button" onclick={handleNewMaze}>New random maze</button>
						<button class="btn btn-ghost" type="button" onclick={() => game?.restart()}>
							Restart run
						</button>
					</div>

					{#if errorMessage}
						<p class="alert alert-error" role="alert">{errorMessage}</p>
					{/if}
				</form>

				<fieldset class="fieldset rounded-box border border-base-300 p-4">
					<legend class="fieldset-legend">Ball feel</legend>

					<label class="flex flex-col gap-1" for="labyrinth-max-tilt">
						<span class="text-sm">Max tilt: {maxTiltDegrees.toFixed(1)}°</span>
						<input
							id="labyrinth-max-tilt"
							class="range range-sm"
							type="range"
							min="1"
							max="8"
							step="0.5"
							bind:value={maxTiltDegrees}
						/>
					</label>

					<label class="flex flex-col gap-1" for="labyrinth-rolling-resistance">
						<span class="text-sm">Rolling resistance: {rollingResistance.toFixed(2)}</span>
						<input
							id="labyrinth-rolling-resistance"
							class="range range-sm"
							type="range"
							min="0"
							max="2"
							step="0.05"
							bind:value={rollingResistance}
						/>
					</label>

					<label class="flex flex-col gap-1" for="labyrinth-wall-bounce">
						<span class="text-sm">Wall bounce: {wallBounce.toFixed(2)}</span>
						<input
							id="labyrinth-wall-bounce"
							class="range range-sm"
							type="range"
							min="0"
							max="0.9"
							step="0.05"
							bind:value={wallBounce}
						/>
					</label>
				</fieldset>

				<div class="space-y-2 text-sm text-base-content/70">
					<p>
						<span class="font-medium text-base-content">Controls:</span>
						arrow keys / WASD, or press and drag on the board like a joystick.
					</p>
					{#if deviceTiltSupported}
						<button
							class="btn btn-sm"
							type="button"
							disabled={!game}
							aria-pressed={deviceTiltEnabled}
							onclick={toggleDeviceTilt}
						>
							{deviceTiltEnabled ? 'Disable phone tilt' : 'Use phone tilt'}
						</button>
						<p>Phone tilt calibrates to how you're holding the phone when you turn it on.</p>
					{/if}
				</div>
			</div>

			<div class="space-y-3">
				<div
					class="relative h-[min(75vh,760px)] min-h-80 w-full overflow-hidden rounded-box border border-base-300 bg-neutral"
				>
					<div bind:this={boardElement} class="absolute inset-0"></div>

					{#if loadingGame}
						<div class="absolute inset-0 grid place-items-center text-neutral-content">
							<span class="loading loading-lg loading-spinner" aria-label="Loading physics"></span>
						</div>
					{/if}

					{#if status.phase === 'won'}
						<div class="absolute inset-0 grid place-items-center bg-black/40">
							<div class="card bg-base-100 shadow-xl">
								<div class="card-body items-center text-center">
									<h2 class="card-title text-2xl">Goal!</h2>
									<p>
										{formatSeconds(status.elapsedSeconds)} · {status.falls}
										{status.falls === 1 ? 'fall' : 'falls'}
									</p>
									<div class="card-actions">
										<button class="btn btn-primary" type="button" onclick={() => game?.restart()}>
											Play again
										</button>
										<button class="btn" type="button" onclick={handleNewMaze}>New maze</button>
									</div>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<p role="status" aria-live="polite">
					{#if layout && generated}
						{formatStatus(status)} · {layout.rows}×{layout.columns} ·
						{layout.holes.length - 1} trap holes · seed {generated.seed}
					{:else}
						Waiting for valid labyrinth settings.
					{/if}
				</p>

				<p class="text-sm text-base-content/70">
					{engineLabel} · fixed step {PHYSICS_HZ} Hz ·
					{#if status.physicsStepMs > 0}
						<span data-testid="physics-step-time">{status.physicsStepMs.toFixed(3)} ms/step</span>
					{:else}
						measuring…
					{/if}
				</p>
			</div>
		</div>
	</section>
</main>
