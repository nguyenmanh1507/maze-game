import { createSeededRandom } from '$lib/maze/helpers'
import type { GridLayout, MazeModelV1 } from '$lib/maze/maze-model'

/**
 * Điểm trên mặt phẳng board (X sang phải, Z hướng về phía người chơi).
 * Đơn vị mặc định là centimet để mô phỏng gần với board Labyrinth thật.
 */
export interface BoardPoint {
	x: number
	z: number
}

export interface LabyrinthWall {
	center: { x: number; y: number; z: number }
	size: { x: number; y: number; z: number }
}

export interface LabyrinthHole {
	nodeId: string
	kind: 'goal' | 'trap'
	position: BoardPoint
	radius: number
}

export interface LabyrinthLayout {
	rows: number
	columns: number
	cellSize: number
	wallThickness: number
	wallHeight: number
	ballRadius: number
	/** Kích thước mặt sàn, tính cả độ dày tường bao ngoài. */
	width: number
	depth: number
	startNodeId: string
	goalNodeId: string
	start: BoardPoint
	walls: LabyrinthWall[]
	holes: LabyrinthHole[]
	/** Đường kẻ chỉ dẫn từ start tới goal (tâm các cell của lời giải). */
	guidePath: BoardPoint[]
}

export interface LabyrinthLayoutOptions {
	cellSize?: number
	wallThickness?: number
	wallHeight?: number
	ballRadius?: number
	holeRadius?: number
	trapHoleCount?: number
	seed?: number
}

export interface BuildLabyrinthLayoutInput {
	layout: GridLayout
	model: MazeModelV1
	/** Lời giải start → goal; phần tử đầu là start, phần tử cuối là goal. */
	solutionNodeIds: readonly string[]
}

export const DEFAULT_LABYRINTH_CELL_SIZE = 2.4
export const DEFAULT_LABYRINTH_WALL_THICKNESS = 0.3
export const DEFAULT_LABYRINTH_WALL_HEIGHT = 1.1
export const DEFAULT_LABYRINTH_BALL_RADIUS = 0.6
export const DEFAULT_LABYRINTH_HOLE_RADIUS = 0.82

export function buildLabyrinthLayout(
	input: BuildLabyrinthLayoutInput,
	options: LabyrinthLayoutOptions = {}
): LabyrinthLayout {
	const {
		cellSize = DEFAULT_LABYRINTH_CELL_SIZE,
		wallThickness = DEFAULT_LABYRINTH_WALL_THICKNESS,
		wallHeight = DEFAULT_LABYRINTH_WALL_HEIGHT,
		ballRadius = DEFAULT_LABYRINTH_BALL_RADIUS,
		holeRadius = DEFAULT_LABYRINTH_HOLE_RADIUS,
		trapHoleCount = 0,
		seed = 1
	} = options
	const { layout, model, solutionNodeIds } = input

	validateOptions({ cellSize, wallThickness, wallHeight, ballRadius, holeRadius, trapHoleCount })

	if (solutionNodeIds.length === 0) {
		throw new Error('Labyrinth needs a solved maze (empty solution path).')
	}

	const cellPositions = collectCellPositions(layout, cellSize)

	for (const nodeId of solutionNodeIds) {
		if (!cellPositions.has(nodeId)) {
			throw new Error(`Solution node "${nodeId}" is not part of the grid layout.`)
		}
	}

	const linked = buildLinkedSet(model)
	const startNodeId = solutionNodeIds[0]
	const goalNodeId = solutionNodeIds[solutionNodeIds.length - 1]
	const getPosition = (nodeId: string): BoardPoint => cellPositions.get(nodeId) as BoardPoint

	const trapNodeIds = pickTrapHoleNodeIds({
		cellNodeIds: [...cellPositions.keys()],
		linked,
		solutionNodeIds,
		count: trapHoleCount,
		seed
	})

	return {
		rows: layout.rows,
		columns: layout.columns,
		cellSize,
		wallThickness,
		wallHeight,
		ballRadius,
		width: layout.columns * cellSize + wallThickness,
		depth: layout.rows * cellSize + wallThickness,
		startNodeId,
		goalNodeId,
		start: getPosition(startNodeId),
		walls: buildWalls(layout, linked, { cellSize, wallThickness, wallHeight }),
		holes: [
			{ nodeId: goalNodeId, kind: 'goal', position: getPosition(goalNodeId), radius: holeRadius },
			...trapNodeIds.map((nodeId): LabyrinthHole => ({
				nodeId,
				kind: 'trap',
				position: getPosition(nodeId),
				radius: holeRadius
			}))
		],
		guidePath: solutionNodeIds.map(getPosition)
	}
}

function validateOptions(options: Required<Omit<LabyrinthLayoutOptions, 'seed'>>): void {
	const { cellSize, wallThickness, wallHeight, ballRadius, holeRadius, trapHoleCount } = options

	for (const [name, value] of Object.entries({ cellSize, wallThickness, wallHeight, ballRadius })) {
		if (!Number.isFinite(value) || value <= 0) {
			throw new Error(`${name} must be greater than 0.`)
		}
	}

	if (!Number.isInteger(trapHoleCount) || trapHoleCount < 0) {
		throw new Error('trapHoleCount must be a non-negative integer.')
	}

	const corridorWidth = cellSize - wallThickness

	if (ballRadius * 2 >= corridorWidth) {
		throw new Error('Ball is too large to fit through the corridors.')
	}

	/*
	 * Lỗ phải lớn hơn bi để bi lọt được xuống,
	 * nhưng vẫn nằm gọn trong lòng hành lang.
	 */
	if (holeRadius <= ballRadius || holeRadius * 2 >= corridorWidth) {
		throw new Error('holeRadius must be larger than the ball and fit inside a corridor.')
	}
}

/**
 * Tâm cell được đặt đối xứng quanh gốc toạ độ.
 * row 0 là hàng phía Bắc, tức là xa người chơi nhất (Z âm).
 */
function collectCellPositions(layout: GridLayout, cellSize: number): Map<string, BoardPoint> {
	const positions = new Map<string, BoardPoint>()

	for (let row = 0; row < layout.rows; row += 1) {
		for (let column = 0; column < layout.columns; column += 1) {
			const nodeId = layout.cells[row]?.[column]
			if (!nodeId) continue

			positions.set(nodeId, {
				x: (column - (layout.columns - 1) / 2) * cellSize,
				z: (row - (layout.rows - 1) / 2) * cellSize
			})
		}
	}

	return positions
}

function buildLinkedSet(model: MazeModelV1): Set<string> {
	const linked = new Set<string>()

	for (const edge of Object.values(model.edges)) {
		linked.add(linkKey(edge.from, edge.to))
	}

	return linked
}

function linkKey(first: string, second: string): string {
	return first < second ? `${first}|${second}` : `${second}|${first}`
}

function hasWallBetween(
	linked: ReadonlySet<string>,
	first: string | undefined,
	second: string | undefined
): boolean {
	if (!first && !second) return false
	if (!first || !second) return true

	return !linked.has(linkKey(first, second))
}

/**
 * Gộp các đoạn tường thẳng hàng liên tiếp thành một khối dài.
 *
 * Ít collider hơn và quan trọng hơn: không có "mối nối" giữa các cuboid,
 * nên bi lăn dọc tường không bị vấp (ghost collision).
 */
function buildWalls(
	layout: GridLayout,
	linked: ReadonlySet<string>,
	dimensions: { cellSize: number; wallThickness: number; wallHeight: number }
): LabyrinthWall[] {
	const { cellSize, wallThickness, wallHeight } = dimensions
	const { rows, columns, cells } = layout
	const walls: LabyrinthWall[] = []
	const getCell = (row: number, column: number): string | undefined => cells[row]?.[column]

	const pushRun = (
		axis: 'x' | 'z',
		lineCoordinate: number,
		fromIndex: number,
		toIndex: number,
		count: number
	): void => {
		const start = (fromIndex - count / 2) * cellSize - wallThickness / 2
		const end = (toIndex + 1 - count / 2) * cellSize + wallThickness / 2
		const length = end - start
		const middle = (start + end) / 2

		walls.push(
			axis === 'x'
				? {
						center: { x: middle, y: wallHeight / 2, z: lineCoordinate },
						size: { x: length, y: wallHeight, z: wallThickness }
					}
				: {
						center: { x: lineCoordinate, y: wallHeight / 2, z: middle },
						size: { x: wallThickness, y: wallHeight, z: length }
					}
		)
	}

	/*
	 * Tường ngang: đường biên giữa row-1 và row, chạy dọc theo trục X.
	 */
	for (let line = 0; line <= rows; line += 1) {
		const z = (line - rows / 2) * cellSize
		let runStart: number | undefined

		for (let column = 0; column <= columns; column += 1) {
			const isWall =
				column < columns && hasWallBetween(linked, getCell(line - 1, column), getCell(line, column))

			if (isWall && runStart === undefined) runStart = column
			if (!isWall && runStart !== undefined) {
				pushRun('x', z, runStart, column - 1, columns)
				runStart = undefined
			}
		}
	}

	/*
	 * Tường dọc: đường biên giữa column-1 và column, chạy dọc theo trục Z.
	 */
	for (let line = 0; line <= columns; line += 1) {
		const x = (line - columns / 2) * cellSize
		let runStart: number | undefined

		for (let row = 0; row <= rows; row += 1) {
			const isWall =
				row < rows && hasWallBetween(linked, getCell(row, line - 1), getCell(row, line))

			if (isWall && runStart === undefined) runStart = row
			if (!isWall && runStart !== undefined) {
				pushRun('z', x, runStart, row - 1, rows)
				runStart = undefined
			}
		}
	}

	return walls
}

/**
 * Chọn cell đặt lỗ bẫy.
 *
 * - Không bao giờ nằm trên đường lời giải, nên maze luôn giải được.
 * - Ưu tiên cell nối trực tiếp với đường lời giải: bi lăn quá đà ở khúc cua sẽ rơi xuống.
 * - Trong nhóm đó ưu tiên dead end, giống board Labyrinth thật.
 * - Bỏ qua cell kề start để người chơi không rơi ngay khi vừa bắt đầu.
 */
function pickTrapHoleNodeIds(options: {
	cellNodeIds: string[]
	linked: ReadonlySet<string>
	solutionNodeIds: readonly string[]
	count: number
	seed: number
}): string[] {
	const { cellNodeIds, linked, solutionNodeIds, count, seed } = options
	if (count === 0) return []

	const onSolution = new Set(solutionNodeIds)
	const startNodeId = solutionNodeIds[0]
	const neighborsByNodeId = new Map<string, string[]>(cellNodeIds.map((nodeId) => [nodeId, []]))

	for (const key of linked) {
		const [first, second] = key.split('|')
		neighborsByNodeId.get(first)?.push(second)
		neighborsByNodeId.get(second)?.push(first)
	}

	const random = createSeededRandom(seed)
	const candidates = cellNodeIds
		.filter((nodeId) => !onSolution.has(nodeId))
		.filter((nodeId) => !(neighborsByNodeId.get(nodeId) ?? []).includes(startNodeId))
		.map((nodeId) => {
			const neighbors = neighborsByNodeId.get(nodeId) ?? []

			return {
				nodeId,
				touchesSolution: neighbors.some((neighborId) => onSolution.has(neighborId)),
				isDeadEnd: neighbors.length === 1,
				tieBreaker: random()
			}
		})
		.sort(
			(first, second) =>
				Number(second.touchesSolution) - Number(first.touchesSolution) ||
				Number(second.isDeadEnd) - Number(first.isDeadEnd) ||
				first.tieBreaker - second.tieBreaker
		)

	return candidates.slice(0, count).map((candidate) => candidate.nodeId)
}
