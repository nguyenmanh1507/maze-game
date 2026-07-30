import { describe, expect, it } from 'vitest'
import { addPassage, cloneMazeModel } from './helpers'
import { braidMaze } from './maze-braid-generator'
import { generateRecursiveBacktrackerMaze } from './maze-recursive-backtracker-generator'
import { createBlankGridMaze, type MazeModelV1, type MazeTopology } from './maze-model'
import { createPolarMaze } from './polar-maze'

describe('braidMaze', () => {
	it('returns an unchanged clone when the requested ratio is zero', () => {
		const draft = createBlankGridMaze({ rows: 4, columns: 4 })
		const source = generateRecursiveBacktrackerMaze(draft, { seed: 42 })
		const result = braidMaze(source, draft.topology, { ratio: 0, seed: 7 })

		expect(result.model).toEqual(source)
		expect(result.model).not.toBe(source)
		expect(result.addedEdgeIds).toEqual([])
		expect(result.targetRemovedCount).toBe(0)
		expect(result.actualRemovedCount).toBe(0)
		expect(result.targetReached).toBe(true)
	})

	it('deterministically removes dead ends using only valid topology edges', () => {
		const draft = createBlankGridMaze({ rows: 8, columns: 8 })
		const source = generateRecursiveBacktrackerMaze(draft, { seed: 42 })
		const original = cloneMazeModel(source)
		const startNodeId = getCellId(draft.layout.cells[7][0])
		const goalNodeId = getCellId(draft.layout.cells[0][7])
		const options = {
			ratio: 0.5,
			seed: 91,
			minCycleLength: 4,
			protectedNodeIds: new Set([startNodeId, goalNodeId])
		}
		const first = braidMaze(source, draft.topology, options)
		const second = braidMaze(source, draft.topology, options)

		expect(first).toEqual(second)
		expect(source).toEqual(original)
		expect(Object.keys(first.model.edges)).toHaveLength(
			Object.keys(source.edges).length + first.addedEdgeIds.length
		)
		expect(first.actualRemovedCount).toBeLessThanOrEqual(first.targetRemovedCount)
		expect(first.finalDeadEndCount).toBeLessThanOrEqual(first.initialDeadEndCount)
		expect(first.initialDeadEndCount - first.finalDeadEndCount).toBe(first.actualRemovedCount)
		expect(countDegree(first.model, startNodeId)).toBe(countDegree(source, startNodeId))
		expect(countDegree(first.model, goalNodeId)).toBe(countDegree(source, goalNodeId))
		expect(isConnected(first.model)).toBe(true)

		for (const edgeId of first.addedEdgeIds) {
			const edge = first.model.edges[edgeId]
			expect(draft.topology.neighborsByNodeId[edge.from]).toContain(edge.to)
		}

		expectMinimumCycleLengths(source, first.model, first.addedEdgeIds, 4)
	})

	it('braids a polar topology without changing the outer entrance or center goal', () => {
		const draft = createPolarMaze({ rings: 12 })
		const source = generateRecursiveBacktrackerMaze(draft, { seed: 42 })
		const original = cloneMazeModel(source)
		const startNodeId = getCellId(draft.polarLayout.rings.at(-1)?.[0])
		const goalNodeId = getCellId(draft.polarLayout.rings[0]?.[0])
		const options = {
			ratio: 0.4,
			seed: 42 ^ 0x9e3779b9,
			minCycleLength: 8,
			protectedNodeIds: new Set([startNodeId, goalNodeId])
		}
		const first = braidMaze(source, draft.topology, options)
		const second = braidMaze(source, draft.topology, options)

		expect(first).toEqual(second)
		expect(source).toEqual(original)
		expect(first.addedEdgeIds.length).toBeGreaterThan(0)
		expect(Object.keys(first.model.edges)).toHaveLength(
			Object.keys(source.edges).length + first.addedEdgeIds.length
		)
		expect(cycleRank(first.model) - cycleRank(source)).toBe(first.addedEdgeIds.length)
		expect(first.finalDeadEndCount).toBeLessThanOrEqual(first.initialDeadEndCount)
		expect(countDegree(first.model, startNodeId)).toBe(countDegree(source, startNodeId))
		expect(countDegree(first.model, goalNodeId)).toBe(countDegree(source, goalNodeId))

		for (const edgeId of first.addedEdgeIds) {
			const edge = first.model.edges[edgeId]
			expect(draft.topology.neighborsByNodeId[edge.from]).toContain(edge.to)
		}

		expectMinimumCycleLengths(source, first.model, first.addedEdgeIds, 8)
	})

	it('prefers a straight continuation from the current dead end', () => {
		const draft = createBlankGridMaze({ rows: 3, columns: 3 })
		const source = draft.model
		const path = [
			[0, 0],
			[0, 1],
			[0, 2],
			[1, 2],
			[2, 2],
			[2, 1],
			[2, 0],
			[1, 0],
			[1, 1]
		] as const

		for (let index = 1; index < path.length; index += 1) {
			addPassage(
				source,
				getCellId(draft.layout.cells[path[index - 1][0]][path[index - 1][1]]),
				getCellId(draft.layout.cells[path[index][0]][path[index][1]])
			)
		}

		const protectedNodeId = getCellId(draft.layout.cells[0][0])
		const deadEndNodeId = getCellId(draft.layout.cells[1][1])
		const straightTargetId = getCellId(draft.layout.cells[1][2])
		const result = braidMaze(source, draft.topology, {
			ratio: 1,
			seed: 3,
			preferDeadEndNeighbors: false,
			preferStraight: true,
			protectedNodeIds: new Set([protectedNodeId])
		})
		const addedEdge = result.model.edges[result.addedEdgeIds[0]]

		expect([addedEdge.from, addedEdge.to].sort()).toEqual([deadEndNodeId, straightTargetId].sort())
	})

	it('respects maxAddedEdges and reports an unreachable removal target', () => {
		const draft = createBlankGridMaze({ rows: 5, columns: 5 })
		const source = generateRecursiveBacktrackerMaze(draft, { seed: 11 })
		const result = braidMaze(source, draft.topology, {
			ratio: 1,
			seed: 12,
			maxAddedEdges: 0
		})

		expect(result.addedEdgeIds).toEqual([])
		expect(result.actualRemovedCount).toBe(0)
		expect(result.targetRemovedCount).toBeGreaterThan(0)
		expect(result.targetReached).toBe(false)
	})

	it('validates options, topology and the generated source graph', () => {
		const draft = createBlankGridMaze({ rows: 2, columns: 2 })
		const generated = generateRecursiveBacktrackerMaze(draft, { seed: 5 })
		const asymmetricTopology: MazeTopology = {
			nodeIds: [...draft.topology.nodeIds],
			neighborsByNodeId: Object.fromEntries(
				Object.entries(draft.topology.neighborsByNodeId).map(([nodeId, neighbors]) => [
					nodeId,
					[...neighbors]
				])
			)
		}
		const firstNodeId = asymmetricTopology.nodeIds[0]
		const firstNeighborId = asymmetricTopology.neighborsByNodeId[firstNodeId][0]
		asymmetricTopology.neighborsByNodeId[firstNeighborId] = asymmetricTopology.neighborsByNodeId[
			firstNeighborId
		].filter((nodeId) => nodeId !== firstNodeId)

		expect(() => braidMaze(generated, draft.topology, { ratio: -0.1 })).toThrow(
			'ratio must be between 0 and 1'
		)
		expect(() => braidMaze(generated, asymmetricTopology, { ratio: 0.4 })).toThrow(
			'Topology must be symmetric'
		)
		expect(() => braidMaze(draft.model, draft.topology, { ratio: 0.4 })).toThrow(
			'Maze graph is disconnected'
		)

		const malformed = cloneMazeModel(generated)
		addPassage(malformed, getCellId(draft.layout.cells[0][0]), getCellId(draft.layout.cells[1][1]))

		expect(() => braidMaze(malformed, draft.topology, { ratio: 0.4 })).toThrow(
			'is not a topology edge'
		)
	})

	it('returns the canonical edge id from addPassage', () => {
		const draft = createBlankGridMaze({ rows: 1, columns: 2 })
		const firstNodeId = getCellId(draft.layout.cells[0][0])
		const secondNodeId = getCellId(draft.layout.cells[0][1])
		const edgeId = addPassage(draft.model, firstNodeId, secondNodeId)

		expect(edgeId).toBe(Object.keys(draft.model.edges)[0])
		expect(addPassage(draft.model, secondNodeId, firstNodeId)).toBe(edgeId)
	})
})

function getCellId(nodeId: string | undefined): string {
	if (!nodeId) throw new Error('Expected an enabled maze cell.')
	return nodeId
}

function countDegree(model: MazeModelV1, nodeId: string): number {
	return Object.values(model.edges).filter((edge) => edge.from === nodeId || edge.to === nodeId)
		.length
}

function cycleRank(model: MazeModelV1): number {
	return Object.keys(model.edges).length - Object.keys(model.nodes).length + 1
}

function isConnected(model: MazeModelV1): boolean {
	const nodeIds = Object.keys(model.nodes)
	const neighbors = new Map(nodeIds.map((nodeId) => [nodeId, [] as string[]]))

	for (const edge of Object.values(model.edges)) {
		neighbors.get(edge.from)?.push(edge.to)
		neighbors.get(edge.to)?.push(edge.from)
	}

	const visited = new Set([nodeIds[0]])
	const queue = [nodeIds[0]]

	for (let index = 0; index < queue.length; index += 1) {
		for (const neighborId of neighbors.get(queue[index]) ?? []) {
			if (visited.has(neighborId)) continue
			visited.add(neighborId)
			queue.push(neighborId)
		}
	}

	return visited.size === nodeIds.length
}

function expectMinimumCycleLengths(
	source: MazeModelV1,
	braided: MazeModelV1,
	addedEdgeIds: readonly string[],
	minimumCycleLength: number
): void {
	const working = cloneMazeModel(source)

	for (const edgeId of addedEdgeIds) {
		const edge = braided.edges[edgeId]
		expect(shortestPathLength(working, edge.from, edge.to) + 1).toBeGreaterThanOrEqual(
			minimumCycleLength
		)
		working.edges[edge.id] = edge
	}
}

function shortestPathLength(model: MazeModelV1, startNodeId: string, goalNodeId: string): number {
	const neighbors = new Map(Object.keys(model.nodes).map((nodeId) => [nodeId, [] as string[]]))

	for (const edge of Object.values(model.edges)) {
		neighbors.get(edge.from)?.push(edge.to)
		neighbors.get(edge.to)?.push(edge.from)
	}

	const queue = [{ nodeId: startNodeId, distance: 0 }]
	const visited = new Set([startNodeId])

	for (let index = 0; index < queue.length; index += 1) {
		const current = queue[index]
		if (current.nodeId === goalNodeId) return current.distance

		for (const neighborId of neighbors.get(current.nodeId) ?? []) {
			if (visited.has(neighborId)) continue
			visited.add(neighborId)
			queue.push({ nodeId: neighborId, distance: current.distance + 1 })
		}
	}

	return Number.POSITIVE_INFINITY
}
