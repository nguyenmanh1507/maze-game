import {
	DEFAULT_PASSAGE_WIDTH,
	type CatmullRomPath,
	type GridLayout,
	type MazeModelV1,
	type Vec2
} from './maze-model'

export interface GridCell {
	id: string
	row: number
	column: number
}

export function getGridCell(layout: GridLayout, row: number, column: number): GridCell | undefined {
	if (row < 0 || row >= layout.rows || column < 0 || column >= layout.columns) {
		return undefined
	}

	return {
		id: layout.cells[row][column],
		row,
		column
	}
}

export function getNorthCell(layout: GridLayout, cell: GridCell): GridCell | undefined {
	return getGridCell(layout, cell.row - 1, cell.column)
}

export function getSouthCell(layout: GridLayout, cell: GridCell): GridCell | undefined {
	return getGridCell(layout, cell.row + 1, cell.column)
}

export function getEastCell(layout: GridLayout, cell: GridCell): GridCell | undefined {
	return getGridCell(layout, cell.row, cell.column + 1)
}

export function getWestCell(layout: GridLayout, cell: GridCell): GridCell | undefined {
	return getGridCell(layout, cell.row, cell.column - 1)
}

export function getAllGridCells(layout: GridLayout): GridCell[] {
	const result: GridCell[] = []

	for (let row = 0; row < layout.rows; row += 1) {
		for (let column = 0; column < layout.columns; column += 1) {
			result.push({
				id: layout.cells[row][column],
				row,
				column
			})
		}
	}

	return result
}

export interface AddPassageOptions {
	width?: number
}

export function addPassage(
	model: MazeModelV1,
	fromNodeId: string,
	toNodeId: string,
	options: AddPassageOptions = {}
): void {
	const fromNode = model.nodes[fromNodeId]
	const toNode = model.nodes[toNodeId]

	if (!fromNode) {
		throw new Error(`Unknown from node: ${fromNodeId}`)
	}

	if (!toNode) {
		throw new Error(`Unknown to node: ${toNodeId}`)
	}

	const edgeId = createUndirectedEdgeId(fromNodeId, toNodeId)

	/*
	 * Tránh tạo duplicate edge.
	 */
	if (model.edges[edgeId]) {
		return
	}

	const width = options.width ?? DEFAULT_PASSAGE_WIDTH

	model.edges[edgeId] = {
		id: edgeId,
		from: fromNodeId,
		to: toNodeId,
		width,

		path: createStraightCatmullRomPath(fromNode.position, toNode.position)
	}
}

function createUndirectedEdgeId(nodeA: string, nodeB: string): string {
	const [first, second] = [nodeA, nodeB].sort()

	return `edge:${first}:${second}`
}

function createStraightCatmullRomPath(from: Vec2, to: Vec2): CatmullRomPath {
	return {
		type: 'catmull-rom',
		tension: 0.5,

		/*
		 * Bốn điểm cùng nằm trên một đường thẳng.
		 * Việc dùng bốn điểm giúp tương thích với những
		 * Catmull-Rom implementation yêu cầu nhiều hơn hai điểm.
		 */
		points: [cloneVec2(from), lerpVec2(from, to, 1 / 3), lerpVec2(from, to, 2 / 3), cloneVec2(to)]
	}
}

export function lerpVec2(from: Vec2, to: Vec2, t: number): Vec2 {
	return {
		x: from.x + (to.x - from.x) * t,
		y: from.y + (to.y - from.y) * t
	}
}

export function cloneVec2(value: Vec2): Vec2 {
	return {
		x: value.x,
		y: value.y
	}
}
