import { cloneVec2 } from './helpers'

export interface Vec2 {
	x: number
	y: number
}

export interface CatmullRomPath {
	type: 'catmull-rom'
	points: Vec2[]
	tension: number
}

export interface MazeModelV1 {
	schemaVersion: 1

	board: {
		radius: number
		wallHeight: number
	}

	nodes: Record<
		string,
		{
			id: string
			position: Vec2
		}
	>

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
	cells: string[][]
}

export interface MazeDraft {
	model: MazeModelV1
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
	const {
		rows,
		columns,
		boardRadius = DEFAULT_BOARD_RADIUS,
		wallHeight = DEFAULT_WALL_HEIGHT,
		boardPaddingRatio = DEFAULT_PADDING_RATIO
	} = options

	assertPositiveInteger(rows, 'rows')
	assertPositiveInteger(columns, 'columns')

	if (boardRadius <= 0) {
		throw new Error('boardRadius must be greater than 0')
	}

	/*
	 * Hình vuông có halfExtent = radius / sqrt(2)
	 * sẽ nằm trọn bên trong hình tròn.
	 */
	const halfExtent = (boardRadius / Math.SQRT2) * boardPaddingRatio

	const nodes: MazeModelV1['nodes'] = {}
	const cells: string[][] = []

	for (let row = 0; row < rows; row += 1) {
		const currentRow: string[] = []

		for (let column = 0; column < columns; column += 1) {
			const id = createCellId(row, column)

			const position: Vec2 = {
				x: interpolateGridCoordinate(column, columns, -halfExtent, halfExtent),

				/*
				 * row 0 là hàng phía Bắc.
				 * Vì vậy Y giảm dần khi row tăng.
				 */
				y: interpolateGridCoordinate(row, rows, halfExtent, -halfExtent)
			}

			nodes[id] = {
				id,
				position
			}

			currentRow.push(id)
		}

		cells.push(currentRow)
	}

	const startNodeId = cells[rows - 1][0]
	const goalNodeId = cells[0][columns - 1]
	// const startNodeId = cells[0][0]
	// const goalNodeId = cells[rows - 1][columns - 1]

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
				position: cloneVec2(nodes[startNodeId].position),
				radius: boardRadius * 0.045
			},

			goal: {
				id: 'goal',
				type: 'goal',
				position: cloneVec2(nodes[goalNodeId].position),
				radius: boardRadius * 0.055
			}
		}
	}

	return {
		model,
		layout: {
			rows,
			columns,
			cells
		}
	}
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
