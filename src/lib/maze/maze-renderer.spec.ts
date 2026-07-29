import { Path, Rect } from 'fabric'
import { describe, expect, it } from 'vitest'
import { addPassage } from './helpers'
import { createBlankGridMaze, createMaskedGridMaze } from './maze-model'
import { renderMaskedGridMaze, renderRectangularMaze, type MazeFabricCanvas } from './maze-renderer'

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
			solutionNodeIds: layout.cells[0].filter((nodeId): nodeId is string => nodeId !== undefined)
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
					[layout.cells[0][0] as string, 0],
					[layout.cells[0][1] as string, 2]
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
				distances: new Map([[layout.cells[0][0] as string, 0]]),
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

describe('renderMaskedGridMaze', () => {
	it('renders each exposed outer and hole boundary for a sparse mask', () => {
		const { model } = createMaskedGridMaze({
			mask: {
				rows: 3,
				columns: 3,
				enabled: [
					[true, true, true],
					[true, false, true],
					[true, true, true]
				]
			},
			startCell: { row: 0, column: 0 },
			goalCell: { row: 2, column: 2 }
		})

		const result = renderMaskedGridMaze(createCanvasDouble(), model)
		const paths = result.objects.filter((object): object is Path => object instanceof Path)

		expect(result.rows).toBe(3)
		expect(result.columns).toBe(3)
		expect(paths).toHaveLength(24)
	})

	it('renders heatmap and solution overlays for enabled cells only', () => {
		const { model, layout } = createMaskedGridMaze({
			mask: {
				rows: 2,
				columns: 2,
				enabled: [
					[true, false],
					[true, true]
				]
			},
			startCell: { row: 0, column: 0 },
			goalCell: { row: 1, column: 1 }
		})
		const start = layout.cells[0][0] as string
		const middle = layout.cells[1][0] as string
		const goal = layout.cells[1][1] as string

		addPassage(model, start, middle)
		addPassage(model, middle, goal)

		const result = renderMaskedGridMaze(createCanvasDouble(), model, {
			distanceField: {
				distances: new Map([
					[start, 0],
					[middle, 1],
					[goal, 2]
				]),
				maximumDistance: 2
			},
			solutionNodeIds: [start, middle, goal]
		})

		expect(result.objects.filter((object) => object instanceof Rect)).toHaveLength(6)
		expect(
			result.objects.some((object) => object instanceof Path && object.stroke === '#22c55e')
		).toBe(true)
	})
})
