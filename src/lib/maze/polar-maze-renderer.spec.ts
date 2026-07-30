import { Circle, Path } from 'fabric'
import { describe, expect, it } from 'vitest'
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
})
