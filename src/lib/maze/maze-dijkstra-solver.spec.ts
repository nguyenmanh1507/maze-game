import { describe, expect, it } from 'vitest'
import { addPassage } from './helpers'
import { createBlankGridMaze } from './maze-model'
import { calculateMazeDistanceField, solveMazeDijkstra } from './maze-dijkstra-solver'

function getCellId(cells: Array<string | undefined>, column: number): string {
	const nodeId = cells[column]

	if (!nodeId) {
		throw new Error(`Expected an enabled cell at column ${column}.`)
	}

	return nodeId
}

describe('solveMazeDijkstra', () => {
	it('returns the lowest-distance route through walkable passages', () => {
		const draft = createBlankGridMaze({ rows: 2, columns: 2 })
		const maze = draft.model

		const topLeft = getCellId(draft.layout.cells[0], 0)
		const topRight = getCellId(draft.layout.cells[0], 1)
		const bottomLeft = getCellId(draft.layout.cells[1], 0)
		const bottomRight = getCellId(draft.layout.cells[1], 1)

		addPassage(maze, bottomLeft, topLeft)
		addPassage(maze, topLeft, topRight)
		addPassage(maze, bottomLeft, bottomRight)
		addPassage(maze, bottomRight, topRight)

		const solution = solveMazeDijkstra(maze)

		expect(solution).toMatchObject({
			status: 'solved',
			nodeIds: [bottomLeft, topLeft, topRight]
		})
		if (solution.status === 'solved') {
			const stepDistance = Math.hypot(
				maze.nodes[topLeft].position.x - maze.nodes[bottomLeft].position.x,
				maze.nodes[topLeft].position.y - maze.nodes[bottomLeft].position.y
			)

			expect(solution.distance).toBeCloseTo(stepDistance * 2)
		}
	})

	it('traverses a passage regardless of the edge direction', () => {
		const draft = createBlankGridMaze({ rows: 1, columns: 2 })
		const maze = draft.model
		const startNodeId = getCellId(draft.layout.cells[0], 0)
		const goalNodeId = getCellId(draft.layout.cells[0], 1)

		addPassage(maze, goalNodeId, startNodeId)

		expect(solveMazeDijkstra(maze)).toMatchObject({
			status: 'solved',
			nodeIds: [startNodeId, goalNodeId]
		})
	})

	it('uses the nearest nodes to the start and goal features', () => {
		const draft = createBlankGridMaze({ rows: 1, columns: 3 })
		const maze = draft.model
		const leftNodeId = getCellId(draft.layout.cells[0], 0)
		const middleNodeId = getCellId(draft.layout.cells[0], 1)
		const rightNodeId = getCellId(draft.layout.cells[0], 2)

		maze.features.start.position = { ...maze.nodes[middleNodeId].position }
		maze.features.goal.position = { ...maze.nodes[rightNodeId].position }
		addPassage(maze, middleNodeId, rightNodeId)

		expect(solveMazeDijkstra(maze)).toMatchObject({
			status: 'solved',
			nodeIds: [middleNodeId, rightNodeId]
		})
		expect(leftNodeId).not.toBe(middleNodeId)
	})

	it('returns unreachable when no passage connects the endpoints', () => {
		const { model } = createBlankGridMaze({ rows: 1, columns: 2 })

		expect(solveMazeDijkstra(model)).toEqual({
			status: 'unreachable',
			nodeIds: [],
			distance: Number.POSITIVE_INFINITY
		})
	})

	it('calculates distances for every reachable node and the maximum distance', () => {
		const draft = createBlankGridMaze({ rows: 2, columns: 2 })
		const maze = draft.model
		const topLeft = getCellId(draft.layout.cells[0], 0)
		const topRight = getCellId(draft.layout.cells[0], 1)
		const bottomLeft = getCellId(draft.layout.cells[1], 0)
		const bottomRight = getCellId(draft.layout.cells[1], 1)

		addPassage(maze, bottomLeft, topLeft)
		addPassage(maze, topLeft, topRight)
		addPassage(maze, bottomLeft, bottomRight)

		const distanceField = calculateMazeDistanceField(maze)
		const stepDistance = Math.hypot(
			maze.nodes[topLeft].position.x - maze.nodes[bottomLeft].position.x,
			maze.nodes[topLeft].position.y - maze.nodes[bottomLeft].position.y
		)

		expect(distanceField.distances).toEqual(
			new Map([
				[bottomLeft, 0],
				[topLeft, stepDistance],
				[bottomRight, stepDistance],
				[topRight, stepDistance * 2]
			])
		)
		expect(distanceField.maximumDistance).toBeCloseTo(stepDistance * 2)
	})

	it('omits unreachable nodes from the distance field', () => {
		const { model, layout } = createBlankGridMaze({ rows: 1, columns: 2 })

		expect(calculateMazeDistanceField(model)).toEqual({
			distances: new Map([[getCellId(layout.cells[0], 0), 0]]),
			maximumDistance: 0
		})
	})

	it('fails clearly when the maze has no goal feature', () => {
		const { model } = createBlankGridMaze({ rows: 1, columns: 1 })
		delete model.features.goal

		expect(() => solveMazeDijkstra(model)).toThrow('MazeModel contains no goal feature.')
	})
})
