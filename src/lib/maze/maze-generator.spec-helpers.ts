import { expect } from 'vitest'
import { createBlankGridMaze, type MazeDraft, type MazeModelV1 } from './maze-model'

export function createTestDraft(rows: number, columns: number): MazeDraft {
	return createBlankGridMaze({ rows, columns })
}

export function expectSpanningTree(maze: MazeModelV1, draft: MazeDraft): void {
	const nodeIds = Object.keys(maze.nodes)
	const positions = new Map<string, { row: number; column: number }>()

	for (let row = 0; row < draft.layout.rows; row += 1) {
		for (let column = 0; column < draft.layout.columns; column += 1) {
			positions.set(draft.layout.cells[row][column], { row, column })
		}
	}

	expect(Object.keys(maze.edges)).toHaveLength(nodeIds.length - 1)

	const neighbors = new Map(nodeIds.map((nodeId) => [nodeId, [] as string[]]))

	for (const edge of Object.values(maze.edges)) {
		const from = positions.get(edge.from)
		const to = positions.get(edge.to)

		expect(from).toBeDefined()
		expect(to).toBeDefined()
		expect(
			Math.abs((from?.row ?? 0) - (to?.row ?? 0)) +
				Math.abs((from?.column ?? 0) - (to?.column ?? 0))
		).toBe(1)

		neighbors.get(edge.from)?.push(edge.to)
		neighbors.get(edge.to)?.push(edge.from)
	}

	const visited = new Set<string>([nodeIds[0]])
	const queue = [nodeIds[0]]

	while (queue.length > 0) {
		const current = queue.shift()

		for (const neighbor of neighbors.get(current ?? '') ?? []) {
			if (visited.has(neighbor)) continue

			visited.add(neighbor)
			queue.push(neighbor)
		}
	}

	expect(visited).toEqual(new Set(nodeIds))
}
