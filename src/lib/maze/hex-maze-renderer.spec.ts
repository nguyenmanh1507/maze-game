import { Path, Rect } from 'fabric'
import { describe, expect, it } from 'vitest'
import { addPassage } from './helpers'
import type { MazeFabricCanvas } from './maze-renderer'
import { createHexMaze } from './hex-maze'
import { renderHexMaze } from './hex-maze-renderer'

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

describe('renderHexMaze', () => {
	it('renders each hex boundary once and removes a carved shared wall', () => {
		const draft = createHexMaze({ rows: 2, columns: 2 })
		const fullyWalled = renderHexMaze(createCanvasDouble(), draft.model)
		const firstNodeId = draft.hexLayout.cells[0][0]
		const neighborNodeId = draft.topology.neighborsByNodeId[firstNodeId][0]

		addPassage(draft.model, firstNodeId, neighborNodeId)
		const carved = renderHexMaze(createCanvasDouble(), draft.model)

		expect(fullyWalled.objects[0]).toBeInstanceOf(Rect)
		expect(fullyWalled.objects.filter((object) => object instanceof Path)).toHaveLength(19)
		expect(carved.objects.filter((object) => object instanceof Path)).toHaveLength(18)
	})
})
