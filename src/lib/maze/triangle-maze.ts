import { cloneMazeModel, cloneVec2 } from './helpers'
import {
	DEFAULT_BOARD_RADIUS,
	DEFAULT_PADDING_RATIO,
	DEFAULT_WALL_HEIGHT,
	type MazeGraphDraft,
	type MazeModelV1,
	type MazeTopology,
	type TriangleCellGeometry,
	type Vec2
} from './maze-model'

export interface TriangleLayout {
	rows: number
	columns: number
	sideLength: number
	cells: string[][]
}

export interface TriangleMazeDraft extends MazeGraphDraft {
	triangleLayout: TriangleLayout
}

export interface CreateTriangleMazeOptions {
	rows: number
	columns: number
	boardRadius?: number
	wallHeight?: number
	boardPaddingRatio?: number
}

export interface TriangleMazeEndpoints {
	startNodeId: string
	goalNodeId: string
}

export interface FinalizedTriangleMaze extends TriangleMazeEndpoints {
	model: MazeModelV1
}

export function createTriangleMaze(options: CreateTriangleMazeOptions): TriangleMazeDraft {
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

	const sideLength = calculateTriangleSideLength(rows, columns, boardRadius * boardPaddingRatio * 2)
	const triangleHeight = (sideLength * Math.sqrt(3)) / 2
	const halfWidth = sideLength / 2
	const halfHeight = triangleHeight / 2
	const width = halfWidth * (columns + 1)
	const height = triangleHeight * rows
	const nodes: MazeModelV1['nodes'] = {}
	const cells = Array.from({ length: rows }, (_, row) =>
		Array.from({ length: columns }, (_, column) => {
			const id = createTriangleCellId(row, column)
			const referenceCenter = {
				x: halfWidth + column * halfWidth - width / 2,
				y: height / 2 - (halfHeight + row * triangleHeight)
			}
			const upright = (row + column) % 2 === 0
			const geometry = createTriangleGeometry(
				row,
				column,
				referenceCenter,
				halfWidth,
				halfHeight,
				upright
			)

			nodes[id] = {
				id,
				position: getTriangleCentroid(geometry.vertices),
				geometry
			}

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
		topology: createTriangleTopology(cells),
		triangleLayout: { rows, columns, sideLength, cells }
	}
}

export function finalizeTriangleMaze(
	model: MazeModelV1,
	draft: TriangleMazeDraft
): FinalizedTriangleMaze {
	const passageNeighbors = createPassageNeighbors(model, draft.topology.nodeIds)
	assertConnectedPassages(passageNeighbors, draft.topology.nodeIds)

	const boundaryNodeIds = draft.topology.nodeIds
		.filter((nodeId) => {
			const neighbors = draft.topology.neighborsByNodeId[nodeId]
			if (!neighbors) {
				throw new Error(`Triangle topology is missing neighbors for node "${nodeId}".`)
			}

			return neighbors.length < 3
		})
		.sort()

	if (boundaryNodeIds.length < 2) {
		throw new Error('Triangle maze needs at least two boundary nodes.')
	}

	const endpoints = findFarthestBoundaryPair(boundaryNodeIds, passageNeighbors)
	const result = cloneMazeModel(model)
	const startFeature = Object.values(result.features).find((feature) => feature.type === 'start')
	const goalFeature = Object.values(result.features).find((feature) => feature.type === 'goal')

	if (!startFeature || !goalFeature) {
		throw new Error('Triangle maze requires start and goal features.')
	}

	startFeature.position = cloneVec2(result.nodes[endpoints.startNodeId].position)
	goalFeature.position = cloneVec2(result.nodes[endpoints.goalNodeId].position)

	return { model: result, ...endpoints }
}

function calculateTriangleSideLength(rows: number, columns: number, mazeDiameter: number): number {
	return Math.min(mazeDiameter / ((columns + 1) / 2), mazeDiameter / ((Math.sqrt(3) / 2) * rows))
}

function createTriangleGeometry(
	row: number,
	column: number,
	center: Vec2,
	halfWidth: number,
	halfHeight: number,
	upright: boolean
): TriangleCellGeometry {
	return {
		type: 'triangle',
		row,
		column,
		upright,
		vertices: upright
			? [
					{ x: center.x - halfWidth, y: center.y - halfHeight },
					{ x: center.x + halfWidth, y: center.y - halfHeight },
					{ x: center.x, y: center.y + halfHeight }
				]
			: [
					{ x: center.x - halfWidth, y: center.y + halfHeight },
					{ x: center.x + halfWidth, y: center.y + halfHeight },
					{ x: center.x, y: center.y - halfHeight }
				]
	}
}

function getTriangleCentroid(vertices: readonly [Vec2, Vec2, Vec2]): Vec2 {
	return {
		x: (vertices[0].x + vertices[1].x + vertices[2].x) / 3,
		y: (vertices[0].y + vertices[1].y + vertices[2].y) / 3
	}
}

function createTriangleTopology(cells: string[][]): MazeTopology {
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
			const upright = (row + column) % 2 === 0
			const nodeId = cells[row][column]

			for (const neighbor of [
				cells[row]?.[column - 1],
				cells[row]?.[column + 1],
				upright ? cells[row + 1]?.[column] : cells[row - 1]?.[column]
			]) {
				connect(nodeId, neighbor)
			}
		}
	}

	return { nodeIds, neighborsByNodeId }
}

function createPassageNeighbors(
	model: MazeModelV1,
	nodeIds: readonly string[]
): Record<string, string[]> {
	const nodeIdSet = new Set(nodeIds)
	const neighbors = Object.fromEntries(nodeIds.map((nodeId) => [nodeId, []])) as Record<
		string,
		string[]
	>

	for (const nodeId of nodeIds) {
		if (!model.nodes[nodeId]) {
			throw new Error(`Triangle topology references missing node "${nodeId}".`)
		}
	}

	for (const edge of Object.values(model.edges)) {
		if (!model.nodes[edge.from] || !model.nodes[edge.to]) {
			throw new Error(`Edge "${edge.id}" references a missing node.`)
		}

		if (!nodeIdSet.has(edge.from) || !nodeIdSet.has(edge.to)) {
			throw new Error(`Edge "${edge.id}" references a node outside the triangle topology.`)
		}

		neighbors[edge.from].push(edge.to)
		neighbors[edge.to].push(edge.from)
	}

	return neighbors
}

function assertConnectedPassages(
	neighbors: Readonly<Record<string, readonly string[]>>,
	nodeIds: readonly string[]
): void {
	const firstNodeId = nodeIds[0]
	if (!firstNodeId) throw new Error('Triangle maze contains no nodes.')

	const visited = new Set([firstNodeId])
	const queue = [firstNodeId]

	for (let index = 0; index < queue.length; index += 1) {
		for (const neighborId of neighbors[queue[index]] ?? []) {
			if (visited.has(neighborId)) continue
			visited.add(neighborId)
			queue.push(neighborId)
		}
	}

	if (visited.size !== nodeIds.length) {
		throw new Error(
			`Triangle maze is disconnected: visited ${visited.size}/${nodeIds.length} nodes.`
		)
	}
}

function findFarthestBoundaryPair(
	boundaryNodeIds: readonly string[],
	neighbors: Readonly<Record<string, readonly string[]>>
): TriangleMazeEndpoints {
	let bestDistance = -1
	let bestPair: TriangleMazeEndpoints | undefined

	for (let firstIndex = 0; firstIndex < boundaryNodeIds.length; firstIndex += 1) {
		const startNodeId = boundaryNodeIds[firstIndex]
		const distances = calculatePassageDistances(startNodeId, neighbors)

		for (let secondIndex = firstIndex + 1; secondIndex < boundaryNodeIds.length; secondIndex += 1) {
			const goalNodeId = boundaryNodeIds[secondIndex]
			const distance = distances.get(goalNodeId)

			if (distance !== undefined && distance > bestDistance) {
				bestDistance = distance
				bestPair = { startNodeId, goalNodeId }
			}
		}
	}

	if (!bestPair) {
		throw new Error('Triangle maze boundary nodes are disconnected.')
	}

	return bestPair
}

function calculatePassageDistances(
	startNodeId: string,
	neighbors: Readonly<Record<string, readonly string[]>>
): Map<string, number> {
	const distances = new Map([[startNodeId, 0]])
	const queue = [startNodeId]

	for (let index = 0; index < queue.length; index += 1) {
		const nodeId = queue[index]
		const distance = distances.get(nodeId) as number

		for (const neighborId of neighbors[nodeId] ?? []) {
			if (distances.has(neighborId)) continue
			distances.set(neighborId, distance + 1)
			queue.push(neighborId)
		}
	}

	return distances
}

function createTriangleCellId(row: number, column: number): string {
	return `triangle:r${row}:c${column}`
}

function assertPositiveInteger(value: number, name: string): void {
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer`)
	}
}
