import { cloneVec2 } from './helpers'
import { assertConnectedMask, type MazeCellCoordinate, type MazeMask } from './maze-mask'

export interface Vec2 {
	x: number
	y: number
}

export interface CatmullRomPath {
	type: 'catmull-rom'
	points: Vec2[]
	tension: number
}

export interface PolarSectorGeometry {
	type: 'polar-sector'
	ring: number
	sector: number
	innerRadius: number
	outerRadius: number
	startAngle: number
	endAngle: number
}

export interface HexCellGeometry {
	type: 'hex'
	row: number
	column: number
	radius: number
	vertices: [Vec2, Vec2, Vec2, Vec2, Vec2, Vec2]
}

export interface TriangleCellGeometry {
	type: 'triangle'
	row: number
	column: number
	upright: boolean
	vertices: [Vec2, Vec2, Vec2]
}

export type MazeCellGeometry = PolarSectorGeometry | HexCellGeometry | TriangleCellGeometry

export interface MazeNode {
	id: string
	position: Vec2
	geometry?: MazeCellGeometry
}

export interface MazeModelV1 {
	schemaVersion: 1

	board: {
		radius: number
		wallHeight: number
	}

	nodes: Record<string, MazeNode>

	edges: Record<
		string,
		{
			id: string
			from: string
			to: string
			path: CatmullRomPath
			width: number
		}
	>

	features: Record<
		string,
		{
			id: string
			type: 'start' | 'goal' | 'hole'
			position: Vec2
			radius: number
		}
	>
}

/**
 * Dữ liệu chỉ phục vụ quá trình generation.
 *
 * MazeModelV1 vẫn là dữ liệu runtime cuối cùng.
 * GridLayout giúp thuật toán biết node nào nằm ở row/column nào.
 */
export interface GridLayout {
	rows: number
	columns: number

	/**
	 * cells[row][column] -> nodeId
	 */
	cells: Array<Array<string | undefined>>
}

export interface MazeTopology {
	nodeIds: string[]
	neighborsByNodeId: Record<string, string[]>
}

export interface MazeGraphDraft {
	model: MazeModelV1
	topology: MazeTopology
}

export interface MazeDraft extends MazeGraphDraft {
	layout: GridLayout
}

export interface CreateBlankMazeOptions {
	rows: number
	columns: number

	boardRadius?: number
	wallHeight?: number

	passageWidth?: number

	/**
	 * Tỉ lệ phần diện tích bên trong board được dùng cho grid.
	 * Giá trị nhỏ hơn 1 để không đặt node sát thành board.
	 */
	boardPaddingRatio?: number
}

export interface CreateMaskedMazeOptions {
	mask: MazeMask
	startCell: MazeCellCoordinate
	goalCell: MazeCellCoordinate

	boardRadius?: number
	wallHeight?: number

	passageWidth?: number

	boardPaddingRatio?: number
}

export const DEFAULT_BOARD_RADIUS = 0.1
export const DEFAULT_WALL_HEIGHT = 0.012
export const DEFAULT_PASSAGE_WIDTH = 0.018
export const DEFAULT_PADDING_RATIO = 0.85

/**
 * Tạo maze ban đầu:
 *
 * - Có nodes.
 * - Chưa có edges.
 * - Có start và goal.
 *
 * Grid hình chữ nhật được đặt trong một hình vuông nội tiếp board tròn.
 */
export function createBlankGridMaze(options: CreateBlankMazeOptions): MazeDraft {
	const { rows, columns, ...sharedOptions } = options

	return createMaskedGridMaze({
		...sharedOptions,
		mask: {
			rows,
			columns,
			enabled: Array.from({ length: rows }, () => Array.from({ length: columns }, () => true))
		},
		startCell: { row: rows - 1, column: 0 },
		goalCell: { row: 0, column: columns - 1 }
	})
}

export function createMaskedGridMaze(options: CreateMaskedMazeOptions): MazeDraft {
	const {
		mask,
		startCell,
		goalCell,
		boardRadius = DEFAULT_BOARD_RADIUS,
		wallHeight = DEFAULT_WALL_HEIGHT,
		boardPaddingRatio = DEFAULT_PADDING_RATIO
	} = options

	assertMazeMask(mask)
	assertConnectedMask(mask, startCell)
	assertEnabledCell(mask, goalCell, 'goal')

	if (boardRadius <= 0) {
		throw new Error('boardRadius must be greater than 0')
	}

	/*
	 * Hình vuông có halfExtent = radius / sqrt(2)
	 * sẽ nằm trọn bên trong hình tròn.
	 */
	const halfExtent = (boardRadius / Math.SQRT2) * boardPaddingRatio

	const nodes: MazeModelV1['nodes'] = {}
	const cells: Array<Array<string | undefined>> = []

	for (let row = 0; row < mask.rows; row += 1) {
		const currentRow: Array<string | undefined> = []

		for (let column = 0; column < mask.columns; column += 1) {
			if (!mask.enabled[row][column]) {
				currentRow.push(undefined)
				continue
			}

			const id = createCellId(row, column)

			const position: Vec2 = {
				x: interpolateGridCoordinate(column, mask.columns, -halfExtent, halfExtent),

				/*
				 * row 0 là hàng phía Bắc.
				 * Vì vậy Y giảm dần khi row tăng.
				 */
				y: interpolateGridCoordinate(row, mask.rows, halfExtent, -halfExtent)
			}

			nodes[id] = {
				id,
				position
			}

			currentRow.push(id)
		}

		cells.push(currentRow)
	}

	const startNodeId = cells[startCell.row][startCell.column]
	const goalNodeId = cells[goalCell.row][goalCell.column]

	const model: MazeModelV1 = {
		schemaVersion: 1,

		board: {
			radius: boardRadius,
			wallHeight
		},

		nodes,

		/*
		 * Maze ban đầu chưa carve passage nào.
		 */
		edges: {},

		features: {
			start: {
				id: 'start',
				type: 'start',
				position: cloneVec2(nodes[startNodeId as string].position),
				radius: boardRadius * 0.045
			},

			goal: {
				id: 'goal',
				type: 'goal',
				position: cloneVec2(nodes[goalNodeId as string].position),
				radius: boardRadius * 0.055
			}
		}
	}

	return {
		model,
		topology: createOrthogonalTopology(cells),
		layout: {
			rows: mask.rows,
			columns: mask.columns,
			cells
		}
	}
}

function createOrthogonalTopology(cells: Array<Array<string | undefined>>): MazeTopology {
	const nodeIds = cells.flat().filter((nodeId): nodeId is string => nodeId !== undefined)
	const neighborsByNodeId = Object.fromEntries(nodeIds.map((nodeId) => [nodeId, []])) as Record<
		string,
		string[]
	>

	for (let row = 0; row < cells.length; row += 1) {
		for (let column = 0; column < cells[row].length; column += 1) {
			const nodeId = cells[row][column]
			if (!nodeId) continue

			for (const neighborId of [cells[row - 1]?.[column], cells[row]?.[column - 1]]) {
				if (!neighborId) continue

				neighborsByNodeId[nodeId].push(neighborId)
				neighborsByNodeId[neighborId].push(nodeId)
			}
		}
	}

	return { nodeIds, neighborsByNodeId }
}

function interpolateGridCoordinate(index: number, count: number, min: number, max: number): number {
	if (count === 1) {
		return (min + max) / 2
	}

	return min + (index / (count - 1)) * (max - min)
}

function createCellId(row: number, column: number): string {
	return `cell:r${row}:c${column}`
}

function assertPositiveInteger(value: number, name: string): void {
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer`)
	}
}

function assertMazeMask(mask: MazeMask): void {
	assertPositiveInteger(mask.rows, 'mask.rows')
	assertPositiveInteger(mask.columns, 'mask.columns')

	if (mask.enabled.length !== mask.rows) {
		throw new Error('mask.enabled must contain one row for every mask row.')
	}

	for (const row of mask.enabled) {
		if (row.length !== mask.columns) {
			throw new Error('mask.enabled rows must contain one value for every mask column.')
		}
	}
}

function assertEnabledCell(mask: MazeMask, cell: MazeCellCoordinate, name: string): void {
	if (!mask.enabled[cell.row]?.[cell.column]) {
		throw new Error(`Maze ${name} cell must be enabled.`)
	}
}
