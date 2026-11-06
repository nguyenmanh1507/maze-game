import { describe, expect, it } from 'vitest'
import { addPassage } from '$lib/maze/helpers'
import { braidMaze } from '$lib/maze/maze-braid-generator'
import { solveMazeDijkstra } from '$lib/maze/maze-dijkstra-solver'
import { createBlankGridMaze, type MazeDraft } from '$lib/maze/maze-model'
import { generateRecursiveBacktrackerMaze } from '$lib/maze/maze-recursive-backtracker-generator'
import { buildLabyrinthLayout, type LabyrinthWall } from './labyrinth-layout'

const OPTIONS = { cellSize: 2, wallThickness: 0.2, wallHeight: 1, ballRadius: 0.5, holeRadius: 0.6 }

function corridorDraft(columns: number): MazeDraft {
	const draft = createBlankGridMaze({ rows: 1, columns })

	for (let column = 0; column < columns - 1; column += 1) {
		addPassage(draft.model, `cell:r0:c${column}`, `cell:r0:c${column + 1}`)
	}

	return draft
}

function rowIds(columns: number): string[] {
	return Array.from({ length: columns }, (_, column) => `cell:r0:c${column}`)
}

function sortWalls(walls: LabyrinthWall[]): LabyrinthWall[] {
	return [...walls].sort(
		(first, second) =>
			first.center.x - second.center.x ||
			first.center.z - second.center.z ||
			first.size.x - second.size.x
	)
}

describe('buildLabyrinthLayout', () => {
	it('merges an open corridor into four boundary wall runs that overlap at the corners', () => {
		const draft = corridorDraft(3)
		const layout = buildLabyrinthLayout(
			{ layout: draft.layout, model: draft.model, solutionNodeIds: rowIds(3) },
			OPTIONS
		)

		expect(layout.width).toBeCloseTo(6.2)
		expect(layout.depth).toBeCloseTo(2.2)
		expect(sortWalls(layout.walls)).toEqual(
			sortWalls([
				{ center: { x: 0, y: 0.5, z: -1 }, size: { x: 6.2, y: 1, z: 0.2 } },
				{ center: { x: 0, y: 0.5, z: 1 }, size: { x: 6.2, y: 1, z: 0.2 } },
				{ center: { x: -3, y: 0.5, z: 0 }, size: { x: 0.2, y: 1, z: 2.2 } },
				{ center: { x: 3, y: 0.5, z: 0 }, size: { x: 0.2, y: 1, z: 2.2 } }
			])
		)
	})

	it('adds an interior wall wherever adjacent cells are not linked', () => {
		const draft = createBlankGridMaze({ rows: 2, columns: 2 })
		addPassage(draft.model, 'cell:r1:c0', 'cell:r0:c0')
		addPassage(draft.model, 'cell:r0:c0', 'cell:r0:c1')
		addPassage(draft.model, 'cell:r0:c1', 'cell:r1:c1')

		const layout = buildLabyrinthLayout(
			{
				layout: draft.layout,
				model: draft.model,
				solutionNodeIds: ['cell:r1:c0', 'cell:r0:c0', 'cell:r0:c1']
			},
			OPTIONS
		)
		const interior = layout.walls.filter(
			(wall) => Math.abs(wall.center.x) < 2 && Math.abs(wall.center.z) < 2
		)

		expect(layout.walls).toHaveLength(5)
		expect(interior).toEqual([{ center: { x: 0, y: 0.5, z: 1 }, size: { x: 0.2, y: 1, z: 2.2 } }])
	})

	it('maps start, goal hole and guide path from the solution with row 0 farthest away', () => {
		const draft = corridorDraft(3)
		const layout = buildLabyrinthLayout(
			{ layout: draft.layout, model: draft.model, solutionNodeIds: rowIds(3) },
			OPTIONS
		)

		expect(layout.start).toEqual({ x: -2, z: 0 })
		expect(layout.holes).toEqual([
			{ nodeId: 'cell:r0:c2', kind: 'goal', position: { x: 2, z: 0 }, radius: 0.6 }
		])
		expect(layout.guidePath).toEqual([
			{ x: -2, z: 0 },
			{ x: 0, z: 0 },
			{ x: 2, z: 0 }
		])
	})

	it('places deterministic trap holes off the solution path and away from the start', () => {
		const rows = 8
		const columns = 8
		const draft = createBlankGridMaze({ rows, columns })
		const perfect = generateRecursiveBacktrackerMaze(draft, { seed: 7 })
		const braided = braidMaze(perfect, draft.topology, { ratio: 0.4, seed: 11 }).model
		const solution = solveMazeDijkstra(braided)
		const input = { layout: draft.layout, model: braided, solutionNodeIds: solution.nodeIds }

		const first = buildLabyrinthLayout(input, { trapHoleCount: 6, seed: 3 })
		const second = buildLabyrinthLayout(input, { trapHoleCount: 6, seed: 3 })
		const traps = first.holes.filter((hole) => hole.kind === 'trap')
		const onSolution = new Set(solution.nodeIds)
		const startNeighbors = new Set(
			Object.values(braided.edges)
				.filter((edge) => edge.from === first.startNodeId || edge.to === first.startNodeId)
				.flatMap((edge) => [edge.from, edge.to])
		)

		expect(solution.status).toBe('solved')
		expect(traps).toHaveLength(6)
		expect(second.holes).toEqual(first.holes)
		expect(traps.every((hole) => !onSolution.has(hole.nodeId))).toBe(true)
		expect(traps.every((hole) => !startNeighbors.has(hole.nodeId))).toBe(true)
	})

	it('caps trap holes at the number of eligible cells', () => {
		const draft = corridorDraft(3)
		const layout = buildLabyrinthLayout(
			{ layout: draft.layout, model: draft.model, solutionNodeIds: rowIds(3) },
			{ ...OPTIONS, trapHoleCount: 5 }
		)

		expect(layout.holes.map((hole) => hole.kind)).toEqual(['goal'])
	})

	it('rejects holes the ball cannot fall into and an empty solution', () => {
		const draft = corridorDraft(2)
		const input = { layout: draft.layout, model: draft.model, solutionNodeIds: rowIds(2) }

		expect(() => buildLabyrinthLayout(input, { ...OPTIONS, holeRadius: 0.4 })).toThrow(/holeRadius/)
		expect(() => buildLabyrinthLayout({ ...input, solutionNodeIds: [] }, OPTIONS)).toThrow(
			/solved maze/
		)
	})
})
