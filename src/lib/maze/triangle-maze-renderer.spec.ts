import { Circle, Path, Rect } from 'fabric'
import { describe, expect, it } from 'vitest'
import { addPassage } from './helpers'
import type { MazeFabricCanvas } from './maze-renderer'
import { createTriangleMaze } from './triangle-maze'
import { renderTriangleMaze } from './triangle-maze-renderer'

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

describe('renderTriangleMaze', () => {
	it('renders each triangular boundary once and removes a carved shared wall', () => {
		const draft = createTriangleMaze({ rows: 2, columns: 2 })
		const fullyWalled = renderTriangleMaze(createCanvasDouble(), draft.model)
		const firstNodeId = draft.triangleLayout.cells[0][0]
		const neighborNodeId = draft.topology.neighborsByNodeId[firstNodeId][0]

		addPassage(draft.model, firstNodeId, neighborNodeId)
		const carved = renderTriangleMaze(createCanvasDouble(), draft.model)

		expect(fullyWalled.objects[0]).toBeInstanceOf(Rect)
		expect(fullyWalled.objects.filter((object) => object instanceof Path)).toHaveLength(9)
		expect(fullyWalled.objects.filter((object) => object instanceof Circle)).toHaveLength(2)
		expect(carved.objects.filter((object) => object instanceof Path)).toHaveLength(8)
	})

	it('opens exactly one outward boundary segment for each endpoint', () => {
		const draft = createTriangleMaze({ rows: 2, columns: 2 })
		const closed = renderTriangleMaze(createCanvasDouble(), draft.model)
		const opened = renderTriangleMaze(createCanvasDouble(), draft.model, {
			openBoundaryNodeIds: ['triangle:r0:c0', 'triangle:r1:c1']
		})

		expect(closed.objects.filter((object) => object instanceof Path)).toHaveLength(9)
		expect(opened.objects.filter((object) => object instanceof Path)).toHaveLength(7)
	})

	it('rejects passages that do not cross a shared triangle edge', () => {
		const draft = createTriangleMaze({ rows: 2, columns: 2 })
		addPassage(draft.model, 'triangle:r0:c0', 'triangle:r1:c1')

		expect(() => renderTriangleMaze(createCanvasDouble(), draft.model)).toThrow(
			'does not cross a shared triangle edge'
		)
	})

	it('matches every topology edge robustly across a larger floating-point grid', () => {
		const draft = createTriangleMaze({ rows: 10, columns: 17 })

		for (const nodeId of draft.topology.nodeIds) {
			for (const neighborId of draft.topology.neighborsByNodeId[nodeId]) {
				if (nodeId < neighborId) addPassage(draft.model, nodeId, neighborId)
			}
		}

		expect(() => renderTriangleMaze(createCanvasDouble(), draft.model)).not.toThrow()
	})

	it('rejects solution hops that are not carved passages', () => {
		const draft = createTriangleMaze({ rows: 2, columns: 2 })

		expect(() =>
			renderTriangleMaze(createCanvasDouble(), draft.model, {
				solutionNodeIds: ['triangle:r0:c0', 'triangle:r0:c1']
			})
		).toThrow('is not a carved passage')
	})

	it('draws the solution through triangle centroids below the feature markers', () => {
		const draft = createTriangleMaze({ rows: 2, columns: 2 })
		const startNodeId = 'triangle:r0:c0'
		const goalNodeId = 'triangle:r0:c1'
		addPassage(draft.model, startNodeId, goalNodeId)

		const rendered = renderTriangleMaze(createCanvasDouble(), draft.model, {
			solutionNodeIds: [startNodeId, goalNodeId]
		})
		const solution = rendered.objects.find(
			(object) => object instanceof Path && object.stroke === '#22c55e'
		) as Path
		const start = rendered.worldToCanvas(draft.model.nodes[startNodeId].position)
		const goal = rendered.worldToCanvas(draft.model.nodes[goalNodeId].position)

		expect(solution.path).toEqual([
			['M', start.x, start.y],
			['L', goal.x, goal.y]
		])
		expect(solution.strokeWidth).toBe(3)
		expect(rendered.objects.slice(-2).every((object) => object instanceof Circle)).toBe(true)
	})
})
