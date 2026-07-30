import { Circle, Path } from 'fabric'
import { describe, expect, it } from 'vitest'
import { braidMaze } from './maze-braid-generator'
import { solveMazeDijkstra } from './maze-dijkstra-solver'
import { generateRecursiveBacktrackerMaze } from './maze-recursive-backtracker-generator'
import type { MazeFabricCanvas } from './maze-renderer'
import { createPolarMaze } from './polar-maze'
import { renderPolarMaze } from './polar-maze-renderer'

function createCanvasDouble(): MazeFabricCanvas {
	const objects: unknown[] = []

	return {
		renderOnAddRemove: true,
		getWidth: () => 200,
		getHeight: () => 200,
		clear: () => objects.splice(0),
		add: (object: unknown) => objects.push(object),
		remove: (object: unknown) => {
			const index = objects.indexOf(object)
			if (index >= 0) objects.splice(index, 1)
		},
		requestRenderAll: () => undefined
	} as unknown as MazeFabricCanvas
}

describe('renderPolarMaze', () => {
	it('renders curved and radial walls and opens the requested outer entrance', () => {
		const draft = createPolarMaze({ rings: 2 })
		const complete = renderPolarMaze(createCanvasDouble(), draft.model)
		const withEntrance = renderPolarMaze(createCanvasDouble(), draft.model, {
			entranceNodeId: 'polar:r1:s0'
		})
		const walls = withEntrance.objects.filter((object): object is Path => object instanceof Path)

		expect(withEntrance.objects[0]).toBeInstanceOf(Circle)
		expect(complete.objects).toHaveLength(21)
		// Fabric normalizes SVG arc commands into cubic Bezier segments.
		expect(walls.some((wall) => wall.path.some((command) => command[0] === 'C'))).toBe(true)
		expect(walls.some((wall) => wall.path.some((command) => command[0] === 'L'))).toBe(true)
		expect(withEntrance.objects.length).toBe(complete.objects.length - 1)
	})

	it('removes walls for braided polar passages while retaining entrance, solution and features', () => {
		const draft = createPolarMaze({ rings: 12 })
		const perfectMaze = generateRecursiveBacktrackerMaze(draft, { seed: 42 })
		const entranceNodeId = draft.polarLayout.rings.at(-1)?.[0]
		const goalNodeId = draft.polarLayout.rings[0]?.[0]

		if (!entranceNodeId || !goalNodeId) throw new Error('Expected polar maze endpoints.')

		const braided = braidMaze(perfectMaze, draft.topology, {
			ratio: 0.4,
			seed: 42 ^ 0x9e3779b9,
			minCycleLength: 8,
			protectedNodeIds: new Set([entranceNodeId, goalNodeId])
		})
		const perfectSolution = solveMazeDijkstra(perfectMaze)
		const braidedSolution = solveMazeDijkstra(braided.model)
		const complete = renderPolarMaze(createCanvasDouble(), perfectMaze, {
			entranceNodeId,
			solutionNodeIds: perfectSolution.status === 'solved' ? perfectSolution.nodeIds : undefined
		})
		const rendered = renderPolarMaze(createCanvasDouble(), braided.model, {
			entranceNodeId,
			solutionNodeIds: braidedSolution.status === 'solved' ? braidedSolution.nodeIds : undefined
		})

		expect(braided.addedEdgeIds.length).toBeGreaterThan(0)
		expect(rendered.objects).toHaveLength(complete.objects.length - braided.addedEdgeIds.length)
		expect(rendered.objects.filter((object) => object instanceof Circle)).toHaveLength(3)
		expect(
			rendered.objects.some((object) => object instanceof Path && object.stroke === '#22c55e')
		).toBe(true)
	})
})
