import { describe, expect, it } from 'vitest'
import { addPassage } from './helpers'
import { createBlankGridMaze } from './maze-model'
import { solveMazeDijkstra } from './maze-dijkstra-solver'

describe('solveMazeDijkstra', () => {
	it('returns the lowest-distance route through walkable passages', () => {
		const draft = createBlankGridMaze({ rows: 2, columns: 2 })
		const maze = draft.model

		const topLeft = draft.layout.cells[0][0]
		const topRight = draft.layout.cells[0][1]
		const bottomLeft = draft.layout.cells[1][0]
		const bottomRight = draft.layout.cells[1][1]

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
		const [startNodeId, goalNodeId] = draft.layout.cells[0]

		addPassage(maze, goalNodeId, startNodeId)

		expect(solveMazeDijkstra(maze)).toMatchObject({
			status: 'solved',
			nodeIds: [startNodeId, goalNodeId]
		})
	})

	it('uses the nearest nodes to the start and goal features', () => {
		const draft = createBlankGridMaze({ rows: 1, columns: 3 })
		const maze = draft.model
		const [leftNodeId, middleNodeId, rightNodeId] = draft.layout.cells[0]

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

	it('fails clearly when the maze has no goal feature', () => {
		const { model } = createBlankGridMaze({ rows: 1, columns: 1 })
		delete model.features.goal

		expect(() => solveMazeDijkstra(model)).toThrow('MazeModel contains no goal feature.')
	})
})
