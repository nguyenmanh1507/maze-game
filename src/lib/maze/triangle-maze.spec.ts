import { describe, expect, it } from 'vitest'
import { cloneMazeModel } from './helpers'
import { generateRecursiveBacktrackerMaze } from './maze-recursive-backtracker-generator'
import { createTriangleMaze, finalizeTriangleMaze } from './triangle-maze'

describe('createTriangleMaze', () => {
	it('creates alternating equilateral triangles with three-way topology', () => {
		const draft = createTriangleMaze({ rows: 3, columns: 3 })
		const uprightNode = draft.model.nodes['triangle:r1:c1']
		const downwardNode = draft.model.nodes['triangle:r1:c2']

		expect(draft.triangleLayout.cells).toEqual([
			['triangle:r0:c0', 'triangle:r0:c1', 'triangle:r0:c2'],
			['triangle:r1:c0', 'triangle:r1:c1', 'triangle:r1:c2'],
			['triangle:r2:c0', 'triangle:r2:c1', 'triangle:r2:c2']
		])
		expect(draft.triangleLayout.sideLength).toBeGreaterThan(0)
		expect(uprightNode.geometry).toMatchObject({
			type: 'triangle',
			row: 1,
			column: 1,
			upright: true
		})
		expect(
			uprightNode.geometry?.type === 'triangle' ? uprightNode.geometry.vertices : []
		).toHaveLength(3)
		expect(downwardNode.geometry).toMatchObject({ type: 'triangle', upright: false })
		const vertices = uprightNode.geometry?.type === 'triangle' ? uprightNode.geometry.vertices : []
		const sideLengths = vertices.map((vertex, index) => {
			const next = vertices[(index + 1) % vertices.length]
			return Math.hypot(next.x - vertex.x, next.y - vertex.y)
		})
		const centroid = {
			x: vertices.reduce((sum, vertex) => sum + vertex.x, 0) / vertices.length,
			y: vertices.reduce((sum, vertex) => sum + vertex.y, 0) / vertices.length
		}

		expect(sideLengths).toEqual([
			expect.closeTo(sideLengths[0]),
			expect.closeTo(sideLengths[0]),
			expect.closeTo(sideLengths[0])
		])
		expect(uprightNode.position.x).toBeCloseTo(centroid.x)
		expect(uprightNode.position.y).toBeCloseTo(centroid.y)
		expect(draft.topology.neighborsByNodeId['triangle:r1:c1']).toEqual([
			'triangle:r1:c0',
			'triangle:r1:c2',
			'triangle:r2:c1'
		])
		expect(draft.topology.neighborsByNodeId['triangle:r1:c2']).toEqual(
			expect.arrayContaining(['triangle:r1:c1', 'triangle:r0:c2'])
		)
		expect(draft.topology.neighborsByNodeId['triangle:r1:c2']).toHaveLength(2)

		for (const [nodeId, neighbors] of Object.entries(draft.topology.neighborsByNodeId)) {
			for (const neighborId of neighbors) {
				expect(draft.topology.neighborsByNodeId[neighborId]).toContain(nodeId)
			}
		}

		const neighborDistances = draft.topology.neighborsByNodeId['triangle:r1:c1'].map(
			(neighborId) => {
				const neighbor = draft.model.nodes[neighborId]
				return Math.hypot(
					neighbor.position.x - uprightNode.position.x,
					neighbor.position.y - uprightNode.position.y
				)
			}
		)

		expect(neighborDistances).toEqual([
			expect.closeTo(neighborDistances[0]),
			expect.closeTo(neighborDistances[0]),
			expect.closeTo(neighborDistances[0])
		])
		expect(draft.model.features.start.position).toEqual(
			draft.model.nodes['triangle:r2:c0'].position
		)
		expect(draft.model.features.goal.position).toEqual(draft.model.nodes['triangle:r0:c2'].position)
	})

	it('validates dimensions', () => {
		expect(() => createTriangleMaze({ rows: 0, columns: 2 })).toThrow(
			'rows must be a positive integer'
		)
		expect(() => createTriangleMaze({ rows: 2, columns: 1.5 })).toThrow(
			'columns must be a positive integer'
		)
	})

	it('works with Recursive Backtracker using only triangle topology edges', () => {
		const draft = createTriangleMaze({ rows: 3, columns: 3 })
		const first = generateRecursiveBacktrackerMaze(draft, { seed: 42 })
		const second = generateRecursiveBacktrackerMaze(draft, { seed: 42 })

		expect(first).toEqual(second)
		expect(Object.keys(first.edges)).toHaveLength(8)

		for (const edge of Object.values(first.edges)) {
			expect(draft.topology.neighborsByNodeId[edge.from]).toContain(edge.to)
		}
	})

	it('finalizes a cloned model with the farthest deterministic boundary endpoints', () => {
		const draft = createTriangleMaze({ rows: 4, columns: 5 })
		const generated = generateRecursiveBacktrackerMaze(draft, { seed: 42 })
		const original = cloneMazeModel(generated)
		const first = finalizeTriangleMaze(generated, draft)
		const second = finalizeTriangleMaze(generated, draft)
		const boundaryNodeIds = draft.topology.nodeIds.filter(
			(nodeId) => draft.topology.neighborsByNodeId[nodeId].length < 3
		)

		expect(first).toEqual(second)
		expect(first.model).not.toBe(generated)
		expect(generated).toEqual(original)
		expect(boundaryNodeIds).toContain(first.startNodeId)
		expect(boundaryNodeIds).toContain(first.goalNodeId)
		expect(first.model.features.start.position).toEqual(
			first.model.nodes[first.startNodeId].position
		)
		expect(first.model.features.goal.position).toEqual(first.model.nodes[first.goalNodeId].position)
		expect(getPassageDistance(first.model, first.startNodeId, first.goalNodeId)).toBe(
			getMaximumBoundaryDistance(first.model, boundaryNodeIds)
		)
	})

	it('rejects disconnected and malformed generated triangle models', () => {
		const draft = createTriangleMaze({ rows: 2, columns: 3 })

		expect(() => finalizeTriangleMaze(draft.model, draft)).toThrow('disconnected')

		const generated = generateRecursiveBacktrackerMaze(draft, { seed: 7 })
		generated.edges.invalid = {
			id: 'invalid',
			from: 'missing-node',
			to: draft.topology.nodeIds[0],
			width: 1,
			path: { type: 'catmull-rom', tension: 0.5, points: [] }
		}

		expect(() => finalizeTriangleMaze(generated, draft)).toThrow('references a missing node')
	})
})

function getMaximumBoundaryDistance(
	model: ReturnType<typeof createTriangleMaze>['model'],
	boundaryNodeIds: readonly string[]
): number {
	let maximumDistance = 0

	for (let firstIndex = 0; firstIndex < boundaryNodeIds.length; firstIndex += 1) {
		for (let secondIndex = firstIndex + 1; secondIndex < boundaryNodeIds.length; secondIndex += 1) {
			maximumDistance = Math.max(
				maximumDistance,
				getPassageDistance(model, boundaryNodeIds[firstIndex], boundaryNodeIds[secondIndex])
			)
		}
	}

	return maximumDistance
}

function getPassageDistance(
	model: ReturnType<typeof createTriangleMaze>['model'],
	startNodeId: string,
	goalNodeId: string
): number {
	const neighbors = Object.fromEntries(
		Object.keys(model.nodes).map((nodeId) => [nodeId, []])
	) as Record<string, string[]>

	for (const edge of Object.values(model.edges)) {
		neighbors[edge.from].push(edge.to)
		neighbors[edge.to].push(edge.from)
	}

	const queue = [{ nodeId: startNodeId, distance: 0 }]
	const visited = new Set([startNodeId])

	for (let index = 0; index < queue.length; index += 1) {
		const current = queue[index]
		if (current.nodeId === goalNodeId) return current.distance

		for (const neighborId of neighbors[current.nodeId]) {
			if (visited.has(neighborId)) continue
			visited.add(neighborId)
			queue.push({ nodeId: neighborId, distance: current.distance + 1 })
		}
	}

	return Number.NEGATIVE_INFINITY
}
