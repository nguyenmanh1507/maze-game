import type { Canvas, StaticCanvas } from 'fabric'
import { Circle, Path, Rect } from 'fabric'
import type { MazeDistanceField } from './maze-dijkstra-solver'
import type { MazeModelV1, Vec2 } from './maze-model'

export type MazeFabricCanvas = Canvas | StaticCanvas

export type MazeFabricObject = Rect | Path | Circle

export interface MazeRendererOptions {
	/**
	 * Khoảng trống giữa maze và mép canvas, đơn vị pixel.
	 */
	padding?: number

	/**
	 * Xóa toàn bộ canvas trước khi render.
	 */
	clearCanvas?: boolean

	boardFill?: string
	wallColor?: string

	/**
	 * Khoảng cách từ start dùng để tô màu nền từng cell.
	 */
	distanceField?: MazeDistanceField

	/**
	 * Độ dày tường bên trong, đơn vị pixel.
	 */
	wallWidth?: number

	/**
	 * Độ dày tường bao ngoài, đơn vị pixel.
	 */
	outerWallWidth?: number

	wallLineCap?: 'butt' | 'round' | 'square'

	startColor?: string
	goalColor?: string
	holeColor?: string

	featureStrokeColor?: string
	featureStrokeWidth?: number

	/**
	 * Đảm bảo feature nhỏ vẫn nhìn thấy được.
	 */
	minimumFeatureRadiusPx?: number

	/**
	 * Hiển thị đường nối giữa các node để debug thuật toán.
	 */
	showPassages?: boolean

	passageDebugColor?: string
	passageDebugWidth?: number

	/**
	 * Node IDs in solution order, from start to goal.
	 */
	solutionNodeIds?: readonly string[]

	solutionColor?: string
	solutionWidth?: number

	/**
	 * Hiển thị tâm của từng node.
	 */
	showNodes?: boolean

	nodeDebugColor?: string
	nodeDebugRadius?: number

	/**
	 * Sai số khi nhóm các node có cùng tọa độ X/Y.
	 */
	coordinateTolerance?: number

	/**
	 * Khi true, renderer báo lỗi nếu edge không nối hai cell kề nhau.
	 */
	strictGridEdges?: boolean

	/**
	 * Kích thước cell fallback khi grid chỉ có một hàng hoặc một cột.
	 * Đơn vị giống position trong MazeModel.
	 */
	singleCellSizeWorld?: number
}

export interface MazeGridCell {
	nodeId: string
	row: number
	column: number
	position: Vec2
}

export interface MazeWorldBounds {
	left: number
	right: number
	top: number
	bottom: number
	width: number
	height: number
}

export interface MazeCanvasBounds {
	left: number
	top: number
	width: number
	height: number
	scale: number
}

export interface MazeRenderResult {
	objects: MazeFabricObject[]

	rows: number
	columns: number

	worldBounds: MazeWorldBounds
	canvasBounds: MazeCanvasBounds

	worldToCanvas(position: Vec2): Vec2

	/**
	 * Chỉ xóa những object do lần render này tạo ra.
	 */
	remove(): void
}

/* -------------------------------------------------------------------------- */
/*                              Internal types                                */
/* -------------------------------------------------------------------------- */

interface InferredRectangularGrid {
	rows: number
	columns: number

	xCenters: number[]

	/**
	 * Sắp xếp từ Bắc xuống Nam, tức Y lớn đến Y nhỏ.
	 */
	yCenters: number[]

	/**
	 * Từ trái sang phải.
	 */
	xBoundaries: number[]

	/**
	 * Từ trên xuống dưới.
	 */
	yBoundaries: number[]

	cells: MazeGridCell[][]

	nodeIndex: Map<string, MazeGridCell>
}

interface CoordinateTransform {
	scale: number
	offsetX: number
	offsetY: number
	worldBounds: MazeWorldBounds
	canvasBounds: MazeCanvasBounds
	worldToCanvas(position: Vec2): Vec2
}

/* -------------------------------------------------------------------------- */
/*                                  Renderer                                  */
/* -------------------------------------------------------------------------- */

export function renderRectangularMaze(
	canvas: MazeFabricCanvas,
	model: MazeModelV1,
	options: MazeRendererOptions = {}
): MazeRenderResult {
	validateBasicModel(model)

	const padding = options.padding ?? 32
	const clearCanvas = options.clearCanvas ?? true

	const wallWidth = options.wallWidth ?? 4
	const outerWallWidth = options.outerWallWidth ?? wallWidth

	const grid = inferRectangularGrid(model, options)

	const transform = createCoordinateTransform(canvas, grid, padding)

	const passageSet = createPassageSet(model, grid, options.strictGridEdges ?? true)

	const objects: MazeFabricObject[] = []

	// 1. Board background
	objects.push(createBoardBackground(transform.canvasBounds, options.boardFill ?? '#f4f0e8'))

	// 2. Distance heatmap
	if (options.distanceField) {
		objects.push(...createDistanceHeatmapObjects(grid, transform, options.distanceField))
	}

	// 3. Passage debug overlay
	if (options.showPassages) {
		objects.push(...createPassageDebugObjects(model, grid, transform, options))
	}

	// 4. Maze walls
	objects.push(
		...createWallObjects(grid, passageSet, transform, {
			wallColor: options.wallColor ?? '#172033',
			wallWidth,
			outerWallWidth,
			wallLineCap: options.wallLineCap ?? 'square'
		})
	)

	// 5. Solution overlay
	const solutionObject = createSolutionObject(model, transform, options)
	if (solutionObject) {
		objects.push(solutionObject)
	}

	// 6. Start, goal, hole
	objects.push(...createFeatureObjects(model, transform, options))

	// 7. Node debug overlay
	if (options.showNodes) {
		objects.push(...createNodeDebugObjects(grid, transform, options))
	}

	if (clearCanvas) {
		canvas.clear()
	}

	/*
	 * Tránh render lại sau từng object.
	 * Chỉ request render một lần ở cuối.
	 */
	const previousRenderOnAddRemove = canvas.renderOnAddRemove

	canvas.renderOnAddRemove = false

	try {
		for (const object of objects) {
			canvas.add(object)
		}
	} finally {
		canvas.renderOnAddRemove = previousRenderOnAddRemove
	}

	canvas.requestRenderAll()

	return {
		objects,

		rows: grid.rows,
		columns: grid.columns,

		worldBounds: transform.worldBounds,
		canvasBounds: transform.canvasBounds,

		worldToCanvas: transform.worldToCanvas,

		remove(): void {
			const previous = canvas.renderOnAddRemove

			canvas.renderOnAddRemove = false

			try {
				for (const object of objects) {
					canvas.remove(object)
				}
			} finally {
				canvas.renderOnAddRemove = previous
			}

			canvas.requestRenderAll()
		}
	}
}

function createSolutionObject(
	model: MazeModelV1,
	transform: CoordinateTransform,
	options: MazeRendererOptions
): Path | undefined {
	const nodeIds = options.solutionNodeIds

	if (!nodeIds) {
		return undefined
	}

	const points = nodeIds.map((nodeId) => {
		const node = model.nodes[nodeId]

		if (!node) {
			throw new Error(`Solution references missing node "${nodeId}".`)
		}

		return transform.worldToCanvas(node.position)
	})

	if (points.length < 2) {
		return undefined
	}

	const commands: Array<['M', number, number] | ['L', number, number]> = [
		['M', points[0].x, points[0].y],
		...points.slice(1).map((point): ['L', number, number] => ['L', point.x, point.y])
	]

	return new Path(commands, {
		stroke: options.solutionColor ?? '#22c55e',
		strokeWidth: options.solutionWidth ?? 5,
		strokeLineCap: 'round',
		strokeLineJoin: 'round',
		fill: undefined,
		selectable: false,
		evented: false
	})
}

/* -------------------------------------------------------------------------- */
/*                              Grid inference                                */
/* -------------------------------------------------------------------------- */

function inferRectangularGrid(
	model: MazeModelV1,
	options: MazeRendererOptions
): InferredRectangularGrid {
	const tolerance = options.coordinateTolerance ?? 1e-6

	const nodes = Object.values(model.nodes)

	const xCenters = clusterCoordinates(
		nodes.map((node) => node.position.x),
		tolerance
	).sort((a, b) => a - b)

	const yCenters = clusterCoordinates(
		nodes.map((node) => node.position.y),
		tolerance
	).sort((a, b) => b - a)

	const rows = yCenters.length
	const columns = xCenters.length

	const expectedNodeCount = rows * columns

	if (expectedNodeCount !== nodes.length) {
		throw new Error(
			[
				'Nodes do not form a complete rectangular grid.',
				`Detected ${rows} rows × ${columns} columns`,
				`Expected ${expectedNodeCount} nodes`,
				`Received ${nodes.length} nodes`
			].join(' ')
		)
	}

	const cells: Array<Array<MazeGridCell | undefined>> = Array.from({ length: rows }, () =>
		Array.from({ length: columns }, () => undefined)
	)

	const nodeIndex = new Map<string, MazeGridCell>()

	for (const node of nodes) {
		const column = findCoordinateIndex(node.position.x, xCenters, tolerance)

		const row = findCoordinateIndex(node.position.y, yCenters, tolerance)

		if (row < 0 || column < 0) {
			throw new Error(`Cannot map node "${node.id}" to rectangular grid.`)
		}

		if (cells[row][column]) {
			throw new Error(`Multiple nodes occupy grid cell row=${row}, column=${column}.`)
		}

		const gridCell: MazeGridCell = {
			nodeId: node.id,
			row,
			column,
			position: node.position
		}

		cells[row][column] = gridCell
		nodeIndex.set(node.id, gridCell)
	}

	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			if (!cells[row][column]) {
				throw new Error(`Missing node at row=${row}, column=${column}.`)
			}
		}
	}

	const fallbackCellSize = options.singleCellSizeWorld ?? Math.max(model.board.radius * 0.5, 0.001)

	const xBoundaries = buildAscendingBoundaries(xCenters, fallbackCellSize)

	const yBoundaries = buildDescendingBoundaries(yCenters, fallbackCellSize)

	return {
		rows,
		columns,
		xCenters,
		yCenters,
		xBoundaries,
		yBoundaries,
		cells: cells as MazeGridCell[][],
		nodeIndex
	}
}

function clusterCoordinates(values: number[], tolerance: number): number[] {
	const sorted = [...values].sort((a, b) => a - b)

	const groups: number[][] = []

	for (const value of sorted) {
		const current = groups[groups.length - 1]

		if (!current) {
			groups.push([value])
			continue
		}

		const average = current.reduce((sum, item) => sum + item, 0) / current.length

		if (Math.abs(value - average) <= tolerance) {
			current.push(value)
		} else {
			groups.push([value])
		}
	}

	return groups.map((group) => group.reduce((sum, value) => sum + value, 0) / group.length)
}

function findCoordinateIndex(value: number, coordinates: number[], tolerance: number): number {
	let bestIndex = -1
	let bestDistance = Number.POSITIVE_INFINITY

	for (let index = 0; index < coordinates.length; index += 1) {
		const distance = Math.abs(coordinates[index] - value)

		if (distance < bestDistance) {
			bestDistance = distance
			bestIndex = index
		}
	}

	return bestDistance <= tolerance * 2 ? bestIndex : -1
}

function buildAscendingBoundaries(centers: number[], fallbackCellSize: number): number[] {
	if (centers.length === 1) {
		return [centers[0] - fallbackCellSize / 2, centers[0] + fallbackCellSize / 2]
	}

	const boundaries: number[] = []

	boundaries.push(centers[0] - (centers[1] - centers[0]) / 2)

	for (let index = 1; index < centers.length; index += 1) {
		boundaries.push((centers[index - 1] + centers[index]) / 2)
	}

	const lastIndex = centers.length - 1

	boundaries.push(centers[lastIndex] + (centers[lastIndex] - centers[lastIndex - 1]) / 2)

	return boundaries
}

function buildDescendingBoundaries(centers: number[], fallbackCellSize: number): number[] {
	if (centers.length === 1) {
		return [centers[0] + fallbackCellSize / 2, centers[0] - fallbackCellSize / 2]
	}

	const boundaries: number[] = []

	boundaries.push(centers[0] + (centers[0] - centers[1]) / 2)

	for (let index = 1; index < centers.length; index += 1) {
		boundaries.push((centers[index - 1] + centers[index]) / 2)
	}

	const lastIndex = centers.length - 1

	boundaries.push(centers[lastIndex] - (centers[lastIndex - 1] - centers[lastIndex]) / 2)

	return boundaries
}

/* -------------------------------------------------------------------------- */
/*                           Coordinate transform                             */
/* -------------------------------------------------------------------------- */

function createCoordinateTransform(
	canvas: MazeFabricCanvas,
	grid: InferredRectangularGrid,
	padding: number
): CoordinateTransform {
	const canvasWidth = canvas.getWidth()

	const canvasHeight = canvas.getHeight()

	const availableWidth = canvasWidth - padding * 2

	const availableHeight = canvasHeight - padding * 2

	if (availableWidth <= 0 || availableHeight <= 0) {
		throw new Error('Canvas is too small for the configured padding.')
	}

	const worldLeft = grid.xBoundaries[0]

	const worldRight = grid.xBoundaries[grid.xBoundaries.length - 1]

	const worldTop = grid.yBoundaries[0]

	const worldBottom = grid.yBoundaries[grid.yBoundaries.length - 1]

	const worldWidth = worldRight - worldLeft

	const worldHeight = worldTop - worldBottom

	if (worldWidth <= 0 || worldHeight <= 0) {
		throw new Error('Invalid maze world bounds.')
	}

	const scale = Math.min(availableWidth / worldWidth, availableHeight / worldHeight)

	const renderedWidth = worldWidth * scale

	const renderedHeight = worldHeight * scale

	const offsetX = (canvasWidth - renderedWidth) / 2

	const offsetY = (canvasHeight - renderedHeight) / 2

	const worldBounds: MazeWorldBounds = {
		left: worldLeft,
		right: worldRight,
		top: worldTop,
		bottom: worldBottom,
		width: worldWidth,
		height: worldHeight
	}

	const canvasBounds: MazeCanvasBounds = {
		left: offsetX,
		top: offsetY,
		width: renderedWidth,
		height: renderedHeight,
		scale
	}

	return {
		scale,
		offsetX,
		offsetY,
		worldBounds,
		canvasBounds,

		worldToCanvas(position: Vec2): Vec2 {
			return {
				x: offsetX + (position.x - worldLeft) * scale,

				/*
				 * World Y hướng lên,
				 * Canvas Y hướng xuống.
				 */
				y: offsetY + (worldTop - position.y) * scale
			}
		}
	}
}

/* -------------------------------------------------------------------------- */
/*                             Passage topology                               */
/* -------------------------------------------------------------------------- */

function createPassageSet(
	model: MazeModelV1,
	grid: InferredRectangularGrid,
	strict: boolean
): Set<string> {
	const passages = new Set<string>()

	for (const edge of Object.values(model.edges)) {
		const from = grid.nodeIndex.get(edge.from)

		const to = grid.nodeIndex.get(edge.to)

		if (!from) {
			throw new Error(`Edge "${edge.id}" references missing node "${edge.from}".`)
		}

		if (!to) {
			throw new Error(`Edge "${edge.id}" references missing node "${edge.to}".`)
		}

		const rowDistance = Math.abs(from.row - to.row)

		const columnDistance = Math.abs(from.column - to.column)

		const areAdjacent = rowDistance + columnDistance === 1

		if (!areAdjacent) {
			if (strict) {
				throw new Error(
					[
						`Edge "${edge.id}" does not connect adjacent grid cells.`,
						`${edge.from} → ${edge.to}`
					].join(' ')
				)
			}

			continue
		}

		passages.add(createUndirectedPairKey(edge.from, edge.to))
	}

	return passages
}

function hasPassage(passages: Set<string>, nodeA: string, nodeB: string): boolean {
	return passages.has(createUndirectedPairKey(nodeA, nodeB))
}

function createUndirectedPairKey(nodeA: string, nodeB: string): string {
	const pair = [nodeA, nodeB].sort()

	return JSON.stringify(pair)
}

/* -------------------------------------------------------------------------- */
/*                                Background                                  */
/* -------------------------------------------------------------------------- */

function createBoardBackground(bounds: MazeCanvasBounds, fill: string): Rect {
	return new Rect({
		left: bounds.left,
		top: bounds.top,

		width: bounds.width,
		height: bounds.height,

		originX: 'left',
		originY: 'top',

		fill,
		strokeWidth: 0,

		selectable: false,
		evented: false
	})
}

function createDistanceHeatmapObjects(
	grid: InferredRectangularGrid,
	transform: CoordinateTransform,
	distanceField: MazeDistanceField
): Rect[] {
	const cells: Rect[] = []

	for (const row of grid.cells) {
		for (const cell of row) {
			const distance = distanceField.distances.get(cell.nodeId)

			if (distance === undefined) {
				continue
			}

			const intensity =
				distanceField.maximumDistance === 0
					? 1
					: Math.max(
							0,
							Math.min(
								1,
								(distanceField.maximumDistance - distance) / distanceField.maximumDistance
							)
						)

			const topLeft = transform.worldToCanvas({
				x: grid.xBoundaries[cell.column],
				y: grid.yBoundaries[cell.row]
			})
			const bottomRight = transform.worldToCanvas({
				x: grid.xBoundaries[cell.column + 1],
				y: grid.yBoundaries[cell.row + 1]
			})

			cells.push(
				new Rect({
					left: topLeft.x,
					top: topLeft.y,
					width: bottomRight.x - topLeft.x,
					height: bottomRight.y - topLeft.y,
					originX: 'left',
					originY: 'top',
					fill: interpolateDistanceColor(intensity),
					strokeWidth: 0,
					selectable: false,
					evented: false
				})
			)
		}
	}

	return cells
}

function interpolateDistanceColor(intensity: number): string {
	const light = [238, 242, 255]
	const dark = [49, 46, 129]

	const channels = light.map((lightChannel, index) => {
		const darkChannel = dark[index]
		return Math.round(darkChannel + (lightChannel - darkChannel) * intensity)
	})

	return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

/* -------------------------------------------------------------------------- */
/*                                  Walls                                     */
/* -------------------------------------------------------------------------- */

interface WallRenderOptions {
	wallColor: string
	wallWidth: number
	outerWallWidth: number
	wallLineCap: 'butt' | 'round' | 'square'
}

function createWallObjects(
	grid: InferredRectangularGrid,
	passages: Set<string>,
	transform: CoordinateTransform,
	options: WallRenderOptions
): Path[] {
	const walls: Path[] = []

	const createWall = (from: Vec2, to: Vec2, width: number): Path => {
		const start = transform.worldToCanvas(from)

		const end = transform.worldToCanvas(to)

		return new Path(
			[
				['M', start.x, start.y],
				['L', end.x, end.y]
			],
			{
				stroke: options.wallColor,
				strokeWidth: width,
				strokeLineCap: options.wallLineCap,

				selectable: false,
				evented: false
			}
		)
	}

	const left = grid.xBoundaries[0]

	const right = grid.xBoundaries[grid.xBoundaries.length - 1]

	const top = grid.yBoundaries[0]

	const bottom = grid.yBoundaries[grid.yBoundaries.length - 1]

	// Outer boundary: top
	walls.push(createWall({ x: left, y: top }, { x: right, y: top }, options.outerWallWidth))

	// Outer boundary: bottom
	walls.push(createWall({ x: left, y: bottom }, { x: right, y: bottom }, options.outerWallWidth))

	// Outer boundary: left
	walls.push(createWall({ x: left, y: top }, { x: left, y: bottom }, options.outerWallWidth))

	// Outer boundary: right
	walls.push(createWall({ x: right, y: top }, { x: right, y: bottom }, options.outerWallWidth))

	/*
	 * Vertical walls:
	 *
	 * [left cell] | [right cell]
	 */
	for (let row = 0; row < grid.rows; row += 1) {
		for (let column = 1; column < grid.columns; column += 1) {
			const leftCell = grid.cells[row][column - 1]

			const rightCell = grid.cells[row][column]

			if (hasPassage(passages, leftCell.nodeId, rightCell.nodeId)) {
				continue
			}

			const wallX = grid.xBoundaries[column]

			const wallTop = grid.yBoundaries[row]

			const wallBottom = grid.yBoundaries[row + 1]

			walls.push(
				createWall(
					{
						x: wallX,
						y: wallTop
					},
					{
						x: wallX,
						y: wallBottom
					},
					options.wallWidth
				)
			)
		}
	}

	/*
	 * Horizontal walls:
	 *
	 * [top cell]
	 * -----------
	 * [bottom cell]
	 */
	for (let row = 1; row < grid.rows; row += 1) {
		for (let column = 0; column < grid.columns; column += 1) {
			const topCell = grid.cells[row - 1][column]

			const bottomCell = grid.cells[row][column]

			if (hasPassage(passages, topCell.nodeId, bottomCell.nodeId)) {
				continue
			}

			const wallY = grid.yBoundaries[row]

			const wallLeft = grid.xBoundaries[column]

			const wallRight = grid.xBoundaries[column + 1]

			walls.push(
				createWall(
					{
						x: wallLeft,
						y: wallY
					},
					{
						x: wallRight,
						y: wallY
					},
					options.wallWidth
				)
			)
		}
	}

	return walls
}

/* -------------------------------------------------------------------------- */
/*                                 Features                                   */
/* -------------------------------------------------------------------------- */

function createFeatureObjects(
	model: MazeModelV1,
	transform: CoordinateTransform,
	options: MazeRendererOptions
): Circle[] {
	const result: Circle[] = []

	const startColor = options.startColor ?? '#22c55e'

	const goalColor = options.goalColor ?? '#ef4444'

	const holeColor = options.holeColor ?? '#111827'

	const strokeColor = options.featureStrokeColor ?? '#ffffff'

	const strokeWidth = options.featureStrokeWidth ?? 2

	const minimumRadius = options.minimumFeatureRadiusPx ?? 5

	for (const feature of Object.values(model.features)) {
		const center = transform.worldToCanvas(feature.position)

		const radius = Math.max(feature.radius * transform.scale, minimumRadius)

		if (feature.type === 'hole') {
			result.push(
				new Circle({
					left: center.x,
					top: center.y,

					radius,

					originX: 'center',
					originY: 'center',

					fill: holeColor,
					stroke: strokeColor,
					strokeWidth,

					selectable: false,
					evented: false
				})
			)

			continue
		}

		if (feature.type === 'start') {
			result.push(
				new Circle({
					left: center.x,
					top: center.y,

					radius,

					originX: 'center',
					originY: 'center',

					fill: 'rgba(255,255,255,0.85)',
					stroke: startColor,
					strokeWidth: Math.max(strokeWidth, radius * 0.25),

					selectable: false,
					evented: false
				})
			)

			result.push(
				new Circle({
					left: center.x,
					top: center.y,

					radius: radius * 0.25,

					originX: 'center',
					originY: 'center',

					fill: startColor,
					strokeWidth: 0,

					selectable: false,
					evented: false
				})
			)

			continue
		}

		if (feature.type === 'goal') {
			// Outer goal ring
			result.push(
				new Circle({
					left: center.x,
					top: center.y,

					radius,

					originX: 'center',
					originY: 'center',

					fill: goalColor,
					stroke: strokeColor,
					strokeWidth,

					selectable: false,
					evented: false
				})
			)

			// Inner white ring
			result.push(
				new Circle({
					left: center.x,
					top: center.y,

					radius: radius * 0.62,

					originX: 'center',
					originY: 'center',

					fill: '#ffffff',
					strokeWidth: 0,

					selectable: false,
					evented: false
				})
			)

			// Goal center
			result.push(
				new Circle({
					left: center.x,
					top: center.y,

					radius: radius * 0.27,

					originX: 'center',
					originY: 'center',

					fill: goalColor,
					strokeWidth: 0,

					selectable: false,
					evented: false
				})
			)
		}
	}

	return result
}

/* -------------------------------------------------------------------------- */
/*                               Debug rendering                              */
/* -------------------------------------------------------------------------- */

function createPassageDebugObjects(
	model: MazeModelV1,
	grid: InferredRectangularGrid,
	transform: CoordinateTransform,
	options: MazeRendererOptions
): Path[] {
	const color = options.passageDebugColor ?? '#3b82f6'

	const width = options.passageDebugWidth ?? 2

	const result: Path[] = []

	for (const edge of Object.values(model.edges)) {
		const from = grid.nodeIndex.get(edge.from)

		const to = grid.nodeIndex.get(edge.to)

		if (!from || !to) {
			continue
		}

		const start = transform.worldToCanvas(from.position)

		const end = transform.worldToCanvas(to.position)

		result.push(
			new Path(
				[
					['M', start.x, start.y],
					['L', end.x, end.y]
				],
				{
					stroke: color,
					strokeWidth: width,
					strokeDashArray: [6, 4],

					selectable: false,
					evented: false,
					opacity: 0.65
				}
			)
		)
	}

	return result
}

function createNodeDebugObjects(
	grid: InferredRectangularGrid,
	transform: CoordinateTransform,
	options: MazeRendererOptions
): Circle[] {
	const color = options.nodeDebugColor ?? '#8b5cf6'

	const radius = options.nodeDebugRadius ?? 3

	const result: Circle[] = []

	for (const cell of grid.nodeIndex.values()) {
		const center = transform.worldToCanvas(cell.position)

		result.push(
			new Circle({
				left: center.x,
				top: center.y,

				radius,

				originX: 'center',
				originY: 'center',

				fill: color,
				stroke: '#ffffff',
				strokeWidth: 1,

				selectable: false,
				evented: false
			})
		)
	}

	return result
}

/* -------------------------------------------------------------------------- */
/*                                Validation                                  */
/* -------------------------------------------------------------------------- */

function validateBasicModel(model: MazeModelV1): void {
	if (model.schemaVersion !== 1) {
		throw new Error(`Unsupported schema version: ${model.schemaVersion}`)
	}

	const nodes = Object.values(model.nodes)

	if (nodes.length === 0) {
		throw new Error('MazeModel contains no nodes.')
	}

	for (const node of nodes) {
		if (!Number.isFinite(node.position.x)) {
			throw new Error(`Node "${node.id}" has invalid X position.`)
		}

		if (!Number.isFinite(node.position.y)) {
			throw new Error(`Node "${node.id}" has invalid Y position.`)
		}
	}

	for (const edge of Object.values(model.edges)) {
		if (!model.nodes[edge.from]) {
			throw new Error(`Edge "${edge.id}" references missing node "${edge.from}".`)
		}

		if (!model.nodes[edge.to]) {
			throw new Error(`Edge "${edge.id}" references missing node "${edge.to}".`)
		}
	}
}
