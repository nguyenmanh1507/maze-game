import { Path, Rect } from 'fabric'
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

	it('renders a green path for a supplied solution', () => {
		const { model, layout } = createBlankGridMaze({ rows: 1, columns: 2 })

		const result = renderRectangularMaze(createCanvasDouble(), model, {
			solutionNodeIds: layout.cells[0]
		})

		const solutionPath = result.objects.find(
			(object): object is Path => object instanceof Path && object.stroke === '#22c55e'
		)

		expect(solutionPath?.path).toEqual([
			['M', expect.any(Number), expect.any(Number)],
			['L', expect.any(Number), expect.any(Number)]
		])
	})

	it('renders a light-to-dark distance heatmap behind walls and features', () => {
		const { model, layout } = createBlankGridMaze({ rows: 1, columns: 2 })

		const result = renderRectangularMaze(createCanvasDouble(), model, {
			distanceField: {
				distances: new Map([
					[layout.cells[0][0], 0],
					[layout.cells[0][1], 2]
				]),
				maximumDistance: 2
			}
		})

		const heatmapCells = result.objects.slice(1, 3)

		expect(heatmapCells).toHaveLength(2)
		expect(heatmapCells.every((object) => object instanceof Rect)).toBe(true)
		expect(heatmapCells.map((object) => object.fill)).toEqual(['#eef2ff', '#312e81'])
	})

	it('uses the brightest heatmap color for a zero-maximum distance field', () => {
		const { model, layout } = createBlankGridMaze({ rows: 1, columns: 1 })

		const result = renderRectangularMaze(createCanvasDouble(), model, {
			distanceField: {
				distances: new Map([[layout.cells[0][0], 0]]),
				maximumDistance: 0
			}
		})

		expect(result.objects[1]).toBeInstanceOf(Rect)
		expect(result.objects[1].fill).toBe('#eef2ff')
	})

	it('rejects solution paths that reference missing nodes', () => {
		const { model } = createBlankGridMaze({ rows: 1, columns: 1 })

		expect(() =>
			renderRectangularMaze(createCanvasDouble(), model, { solutionNodeIds: ['missing-node'] })
		).toThrow('Solution references missing node "missing-node".')
	})
})
