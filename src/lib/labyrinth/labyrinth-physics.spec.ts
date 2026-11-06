import { beforeAll, describe, expect, it } from 'vitest'
import { addPassage } from '$lib/maze/helpers'
import { createBlankGridMaze } from '$lib/maze/maze-model'
import { loadJoltEngine } from './labyrinth-jolt'
import { buildLabyrinthLayout, type LabyrinthLayout } from './labyrinth-layout'
import {
	DEFAULT_LABYRINTH_TUNING,
	LABYRINTH_FIXED_TIMESTEP,
	LABYRINTH_GRAVITY,
	type LabyrinthPhysicsEngine,
	type LabyrinthPhysicsWorld
} from './labyrinth-physics'
import { loadRapierEngine } from './labyrinth-rapier'
import { tiltToLocalGravity } from './labyrinth-tilt'

const TILT = (5 * Math.PI) / 180

function corridorLayout(columns: number): LabyrinthLayout {
	const draft = createBlankGridMaze({ rows: 1, columns })
	const nodeIds = Array.from({ length: columns }, (_, column) => `cell:r0:c${column}`)

	for (let column = 0; column < columns - 1; column += 1) {
		addPassage(draft.model, nodeIds[column], nodeIds[column + 1])
	}

	return buildLabyrinthLayout({
		layout: draft.layout,
		model: draft.model,
		solutionNodeIds: nodeIds
	})
}

function simulate(world: LabyrinthPhysicsWorld, seconds: number, stop?: () => boolean): number {
	const steps = Math.round(seconds / LABYRINTH_FIXED_TIMESTEP)

	for (let step = 0; step < steps; step += 1) {
		world.step()
		if (stop?.()) return (step + 1) * LABYRINTH_FIXED_TIMESTEP
	}

	return seconds
}

describe.each([
	{ name: 'Rapier', load: loadRapierEngine },
	{ name: 'Jolt', load: loadJoltEngine }
])('$name labyrinth physics', ({ load }) => {
	let engine: LabyrinthPhysicsEngine

	beforeAll(async () => {
		engine = await load()
	})

	it('keeps the ball resting on a level floor', () => {
		const layout = corridorLayout(4)
		const world = engine.createWorld(layout, DEFAULT_LABYRINTH_TUNING)

		simulate(world, 1)

		expect(world.ballPosition.y).toBeCloseTo(layout.ballRadius, 1)
		expect(world.ballPosition.x).toBeCloseTo(layout.start.x, 2)
		expect(world.hasFallen()).toBe(false)
		world.dispose()
	})

	it('rolls toward the low side and is stopped by the outer wall', () => {
		const layout = corridorLayout(4)
		const world = engine.createWorld(layout, DEFAULT_LABYRINTH_TUNING)
		const innerWallX = layout.width / 2 - layout.wallThickness
		/* Bi ở cell đầu, nghiêng sang TRÁI để bi đập vào tường trái (không có lỗ). */
		world.setGravity(tiltToLocalGravity({ x: 0, z: TILT }, LABYRINTH_GRAVITY))

		simulate(world, 2)

		expect(world.ballPosition.x).toBeLessThan(layout.start.x)
		expect(world.ballPosition.x).toBeGreaterThan(-innerWallX + layout.ballRadius - 0.05)
		expect(world.ballPosition.y).toBeCloseTo(layout.ballRadius, 1)
		world.dispose()
	})

	it('rolls rather than slides down a tilted board', () => {
		const layout = corridorLayout(6)
		const world = engine.createWorld(layout, DEFAULT_LABYRINTH_TUNING)
		world.setGravity(tiltToLocalGravity({ x: 0, z: -TILT }, LABYRINTH_GRAVITY))

		simulate(world, 0.3)

		/*
		 * Bi đặc lăn không trượt: a = 5/7 · g · sin θ.
		 * Trượt không ma sát sẽ cho a = g · sin θ (nhanh hơn 40%).
		 */
		const rollingSpeed = (5 / 7) * LABYRINTH_GRAVITY * Math.sin(TILT) * 0.3
		expect(world.ballSpeed).toBeGreaterThan(rollingSpeed * 0.85)
		expect(world.ballSpeed).toBeLessThan(rollingSpeed * 1.1)
		world.dispose()
	})

	it('rolls along the corridor and drops into the goal hole', () => {
		const layout = corridorLayout(4)
		const world = engine.createWorld(layout, DEFAULT_LABYRINTH_TUNING)
		world.setGravity(tiltToLocalGravity({ x: 0, z: -TILT }, LABYRINTH_GRAVITY))

		simulate(world, 4, () => world.hasFallen())

		expect(world.hasFallen()).toBe(true)
		expect(world.nearestHole()?.kind).toBe('goal')
		world.dispose()
	})

	it('respawns the ball at the start with no velocity', () => {
		const layout = corridorLayout(3)
		const world = engine.createWorld(layout, DEFAULT_LABYRINTH_TUNING)
		world.setGravity(tiltToLocalGravity({ x: 0, z: -TILT }, LABYRINTH_GRAVITY))
		simulate(world, 0.5)

		world.respawn()

		expect(world.ballPosition.x).toBeCloseTo(layout.start.x)
		expect(world.ballSpeed).toBe(0)
		world.dispose()
	})
})
