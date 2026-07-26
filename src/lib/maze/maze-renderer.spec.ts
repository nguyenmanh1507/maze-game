import { Path } from 'fabric'
import { describe, expect, it } from 'vitest'
import { createBlankGridMaze } from './maze-model'
import { renderRectangularMaze, type MazeFabricCanvas } from './maze-renderer'

function createCanvasDouble(): MazeFabricCanvas {
	const objects: unknown[] = []

	return {
		renderOnAddRemove: true,
		getWidth: () => 200,
		getHeight: () => 200,
		clear: () => objects.splice(0),
		add: (object: unknown) => {
			objects.push(object)
		},
		remove: (object: unknown) => {
			const index = objects.indexOf(object)

			if (index >= 0) {
				objects.splice(index, 1)
			}
		},
		requestRenderAll: () => undefined
	} as unknown as MazeFabricCanvas
}

describe('renderRectangularMaze', () => {
	it('creates Fabric Paths with move and line commands for each wall', () => {
		const { model } = createBlankGridMaze({ rows: 1, columns: 1 })

		const result = renderRectangularMaze(createCanvasDouble(), model)

		const paths = result.objects.filter((object): object is Path => object instanceof Path)

		expect(paths).toHaveLength(4)

		for (const path of paths) {
			expect(path.path).toHaveLength(2)
			expect(path.path[0][0]).toBe('M')
			expect(path.path[1][0]).toBe('L')
		}
	})
})
