import { cloneVec2 } from './helpers'
import {
	DEFAULT_BOARD_RADIUS,
	DEFAULT_PADDING_RATIO,
	DEFAULT_WALL_HEIGHT,
	type HexCellGeometry,
	type MazeGraphDraft,
	type MazeModelV1,
	type MazeTopology,
	type Vec2
} from './maze-model'

export interface HexLayout {
	rows: number
	columns: number
	cells: string[][]
}

export interface HexMazeDraft extends MazeGraphDraft {
	hexLayout: HexLayout
}

export interface CreateHexMazeOptions {
	rows: number
	columns: number
	boardRadius?: number
	wallHeight?: number
	boardPaddingRatio?: number
}

export function createHexMaze(options: CreateHexMazeOptions): HexMazeDraft {
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

	if (boardPaddingRatio <= 0 || boardPaddingRatio > 1) {
		throw new Error('boardPaddingRatio must be greater than 0 and at most 1')
	}

	const radius = calculateHexRadius(rows, columns, boardRadius * boardPaddingRatio)
	const halfHeight = (Math.sqrt(3) * radius) / 2
	const width = radius * (columns * 1.5 + 0.5)
	const height = Math.sqrt(3) * radius * (rows + 0.5)
	const nodes: MazeModelV1['nodes'] = {}
	const cells = Array.from({ length: rows }, (_, row) =>
		Array.from({ length: columns }, (_, column) => {
			const id = createHexCellId(row, column)
			const center = {
				x: radius + radius * 1.5 * column - width / 2,
				y: height / 2 - (halfHeight + 2 * halfHeight * row + (column % 2) * halfHeight)
			}
			const geometry = createHexGeometry(row, column, center, radius, halfHeight)

			nodes[id] = { id, position: center, geometry }

			return id
		})
	)

	const startNodeId = cells[rows - 1][0]
	const goalNodeId = cells[0][columns - 1]
	const model: MazeModelV1 = {
		schemaVersion: 1,
		board: { radius: boardRadius, wallHeight },
		nodes,
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
		topology: createHexTopology(cells),
		hexLayout: { rows, columns, cells }
	}
}

function calculateHexRadius(rows: number, columns: number, mazeDiameter: number): number {
	const widthFactor = columns * 1.5 + 0.5
	const heightFactor = Math.sqrt(3) * (rows + 0.5)

	return Math.min(mazeDiameter / widthFactor, mazeDiameter / heightFactor)
}

function createHexGeometry(
	row: number,
	column: number,
	center: Vec2,
	radius: number,
	halfHeight: number
): HexCellGeometry {
	return {
		type: 'hex',
		row,
		column,
		radius,
		vertices: [
			{ x: center.x - radius, y: center.y },
			{ x: center.x - radius / 2, y: center.y + halfHeight },
			{ x: center.x + radius / 2, y: center.y + halfHeight },
			{ x: center.x + radius, y: center.y },
			{ x: center.x + radius / 2, y: center.y - halfHeight },
			{ x: center.x - radius / 2, y: center.y - halfHeight }
		]
	}
}

function createHexTopology(cells: string[][]): MazeTopology {
	const nodeIds = cells.flat()
	const neighborsByNodeId = Object.fromEntries(nodeIds.map((nodeId) => [nodeId, []])) as Record<
		string,
		string[]
	>
	const connect = (from: string, to: string | undefined): void => {
		if (!to || from === to || neighborsByNodeId[from].includes(to)) return

		neighborsByNodeId[from].push(to)
		neighborsByNodeId[to].push(from)
	}

	for (let row = 0; row < cells.length; row += 1) {
		for (let column = 0; column < cells[row].length; column += 1) {
			const nodeId = cells[row][column]
			const northDiagonal = column % 2 === 0 ? row - 1 : row
			const southDiagonal = column % 2 === 0 ? row : row + 1

			for (const neighbor of [
				cells[row - 1]?.[column],
				cells[row + 1]?.[column],
				cells[northDiagonal]?.[column - 1],
				cells[northDiagonal]?.[column + 1],
				cells[southDiagonal]?.[column - 1],
				cells[southDiagonal]?.[column + 1]
			]) {
				connect(nodeId, neighbor)
			}
		}
	}

	return { nodeIds, neighborsByNodeId }
}

function createHexCellId(row: number, column: number): string {
	return `hex:r${row}:c${column}`
}

function assertPositiveInteger(value: number, name: string): void {
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer`)
	}
}
