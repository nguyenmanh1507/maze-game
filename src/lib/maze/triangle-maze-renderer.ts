import { Circle, Path, Rect } from 'fabric'
import type { MazeFabricCanvas, MazeFabricObject, MazeRenderResult } from './maze-renderer'
import type { MazeModelV1, TriangleCellGeometry, Vec2 } from './maze-model'

export interface TriangleMazeRendererOptions {
	padding?: number
	clearCanvas?: boolean
	boardFill?: string
	wallColor?: string
	wallWidth?: number
	outerWallWidth?: number
	solutionNodeIds?: readonly string[]
	solutionColor?: string
	solutionWidth?: number
	openBoundaryNodeIds?: readonly string[]
}

interface TriangleNode {
	id: string
	position: Vec2
	geometry: TriangleCellGeometry
}

interface TriangleTransform {
	worldToCanvas(position: Vec2): Vec2
	canvasBounds: { left: number; top: number; width: number; height: number; scale: number }
	worldBounds: {
		left: number
		right: number
		top: number
		bottom: number
		width: number
		height: number
	}
}

interface TriangleSegment {
	from: Vec2
	to: Vec2
	nodeIds: string[]
}

export function renderTriangleMaze(
	canvas: MazeFabricCanvas,
	model: MazeModelV1,
	options: TriangleMazeRendererOptions = {}
): MazeRenderResult {
	const nodes = getTriangleNodes(model)
	const transform = createTriangleTransform(canvas, nodes, options.padding ?? 32)
	const segments = collectTriangleSegments(nodes)
	const passages = createPassageSet(model, segments)
	const openBoundarySegments = selectOpenBoundarySegments(
		segments,
		options.openBoundaryNodeIds ?? [],
		transform
	)
	const objects: MazeFabricObject[] = [
		new Rect({
			left: transform.canvasBounds.left,
			top: transform.canvasBounds.top,
			width: transform.canvasBounds.width,
			height: transform.canvasBounds.height,
			originX: 'left',
			originY: 'top',
			fill: options.boardFill ?? '#f4f0e8',
			strokeWidth: 0,
			selectable: false,
			evented: false
		})
	]

	const wallColor = options.wallColor ?? '#172033'
	const wallWidth = options.wallWidth ?? 4
	const outerWallWidth = options.outerWallWidth ?? wallWidth

	for (const [segmentKey, segment] of segments) {
		const [firstNodeId, secondNodeId] = segment.nodeIds
		const isOuterBoundary = secondNodeId === undefined

		if (openBoundarySegments.has(segmentKey)) continue
		if (!isOuterBoundary && hasPassage(passages, firstNodeId, secondNodeId)) continue

		objects.push(
			createWallPath(
				transform,
				segment.from,
				segment.to,
				isOuterBoundary ? outerWallWidth : wallWidth,
				wallColor
			)
		)
	}

	const solution = createSolutionObject(model, transform, passages, options)
	if (solution) objects.push(solution)
	objects.push(...createFeatureObjects(model, transform))

	if (options.clearCanvas ?? true) canvas.clear()

	const previousRenderOnAddRemove = canvas.renderOnAddRemove
	canvas.renderOnAddRemove = false

	try {
		for (const object of objects) canvas.add(object)
	} finally {
		canvas.renderOnAddRemove = previousRenderOnAddRemove
	}

	canvas.requestRenderAll()

	return {
		objects,
		rows: Math.max(...nodes.map((node) => node.geometry.row)) + 1,
		columns: Math.max(...nodes.map((node) => node.geometry.column)) + 1,
		worldBounds: transform.worldBounds,
		canvasBounds: transform.canvasBounds,
		worldToCanvas: transform.worldToCanvas,
		remove(): void {
			const previous = canvas.renderOnAddRemove
			canvas.renderOnAddRemove = false

			try {
				for (const object of objects) canvas.remove(object)
			} finally {
				canvas.renderOnAddRemove = previous
			}

			canvas.requestRenderAll()
		}
	}
}

function getTriangleNodes(model: MazeModelV1): TriangleNode[] {
	const nodes = Object.values(model.nodes).filter(
		(node): node is TriangleNode => node.geometry?.type === 'triangle'
	)

	if (nodes.length === 0 || nodes.length !== Object.keys(model.nodes).length) {
		throw new Error('Triangle renderer requires every maze node to have triangle geometry.')
	}

	return nodes
}

function createTriangleTransform(
	canvas: MazeFabricCanvas,
	nodes: TriangleNode[],
	padding: number
): TriangleTransform {
	const vertices = nodes.flatMap((node) => node.geometry.vertices)
	const left = Math.min(...vertices.map((vertex) => vertex.x))
	const right = Math.max(...vertices.map((vertex) => vertex.x))
	const top = Math.max(...vertices.map((vertex) => vertex.y))
	const bottom = Math.min(...vertices.map((vertex) => vertex.y))
	const width = right - left
	const height = top - bottom
	const availableWidth = canvas.getWidth() - padding * 2
	const availableHeight = canvas.getHeight() - padding * 2

	if (width <= 0 || height <= 0 || availableWidth <= 0 || availableHeight <= 0) {
		throw new Error('Canvas is too small for the configured triangle maze.')
	}

	const scale = Math.min(availableWidth / width, availableHeight / height)
	const renderedWidth = width * scale
	const renderedHeight = height * scale
	const canvasBounds = {
		left: (canvas.getWidth() - renderedWidth) / 2,
		top: (canvas.getHeight() - renderedHeight) / 2,
		width: renderedWidth,
		height: renderedHeight,
		scale
	}
	const worldBounds = { left, right, top, bottom, width, height }

	return {
		canvasBounds,
		worldBounds,
		worldToCanvas(position: Vec2): Vec2 {
			return {
				x: canvasBounds.left + (position.x - left) * scale,
				y: canvasBounds.top + (top - position.y) * scale
			}
		}
	}
}

function collectTriangleSegments(nodes: TriangleNode[]): Map<string, TriangleSegment> {
	const segments = new Map<string, TriangleSegment>()
	const tolerance = calculateSegmentTolerance(nodes)

	for (const node of nodes) {
		const { vertices } = node.geometry

		for (let index = 0; index < vertices.length; index += 1) {
			const from = vertices[index]
			const to = vertices[(index + 1) % vertices.length]
			let key = createSegmentKey(from, to)
			let segment = segments.get(key)

			if (!segment) {
				const equivalent = findEquivalentSegment(segments, from, to, tolerance)

				if (equivalent) {
					;[key, segment] = equivalent
				}
			}

			if (segment) {
				segment.nodeIds.push(node.id)
				if (segment.nodeIds.length > 2) {
					throw new Error(`Triangle segment "${key}" belongs to more than two nodes.`)
				}
				continue
			}

			segments.set(key, { from, to, nodeIds: [node.id] })
		}
	}

	return segments
}

function findEquivalentSegment(
	segments: ReadonlyMap<string, TriangleSegment>,
	from: Vec2,
	to: Vec2,
	tolerance: number
): [string, TriangleSegment] | undefined {
	for (const entry of segments) {
		const [, candidate] = entry
		if (areEquivalentSegments(candidate.from, candidate.to, from, to, tolerance)) return entry
	}

	return undefined
}

function calculateSegmentTolerance(nodes: readonly TriangleNode[]): number {
	const vertices = nodes.flatMap((node) => node.geometry.vertices)
	const xs = vertices.map((vertex) => vertex.x)
	const ys = vertices.map((vertex) => vertex.y)
	const scale = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))

	return scale * 1e-10
}

function areEquivalentSegments(
	firstFrom: Vec2,
	firstTo: Vec2,
	secondFrom: Vec2,
	secondTo: Vec2,
	tolerance: number
): boolean {
	return (
		(areEquivalentPoints(firstFrom, secondFrom, tolerance) &&
			areEquivalentPoints(firstTo, secondTo, tolerance)) ||
		(areEquivalentPoints(firstFrom, secondTo, tolerance) &&
			areEquivalentPoints(firstTo, secondFrom, tolerance))
	)
}

function areEquivalentPoints(first: Vec2, second: Vec2, tolerance: number): boolean {
	return Math.abs(first.x - second.x) <= tolerance && Math.abs(first.y - second.y) <= tolerance
}

function createSegmentKey(first: Vec2, second: Vec2): string {
	const format = (point: Vec2): string => `${point.x.toFixed(12)},${point.y.toFixed(12)}`

	return [format(first), format(second)].sort().join('|')
}

function createPassageSet(
	model: MazeModelV1,
	segments: ReadonlyMap<string, TriangleSegment>
): Set<string> {
	const sharedEdgePairs = new Set(
		[...segments.values()]
			.filter((segment) => segment.nodeIds.length === 2)
			.map((segment) => createPairKey(segment.nodeIds[0], segment.nodeIds[1]))
	)
	const passages = new Set<string>()

	for (const edge of Object.values(model.edges)) {
		if (!model.nodes[edge.from] || !model.nodes[edge.to]) {
			throw new Error(`Edge "${edge.id}" references a missing node.`)
		}

		const pairKey = createPairKey(edge.from, edge.to)
		if (!sharedEdgePairs.has(pairKey)) {
			throw new Error(`Passage "${edge.id}" does not cross a shared triangle edge.`)
		}

		passages.add(pairKey)
	}

	return passages
}

function hasPassage(passages: ReadonlySet<string>, first: string, second: string): boolean {
	return passages.has(createPairKey(first, second))
}

function createPairKey(first: string, second: string): string {
	return [first, second].sort().join(':')
}

function selectOpenBoundarySegments(
	segments: ReadonlyMap<string, TriangleSegment>,
	nodeIds: readonly string[],
	transform: TriangleTransform
): Set<string> {
	const openSegments = new Set<string>()
	const mazeCenter = {
		x: (transform.worldBounds.left + transform.worldBounds.right) / 2,
		y: (transform.worldBounds.top + transform.worldBounds.bottom) / 2
	}

	for (const nodeId of new Set(nodeIds)) {
		const candidates = [...segments.entries()]
			.filter(([, segment]) => segment.nodeIds.length === 1 && segment.nodeIds[0] === nodeId)
			.map(([key, segment]) => ({
				key,
				score: getSegmentMidpointDistanceSquared(segment, mazeCenter)
			}))
			.sort((first, second) => second.score - first.score || first.key.localeCompare(second.key))

		const selected = candidates[0]
		if (!selected) {
			throw new Error(`Node "${nodeId}" has no outer triangle boundary to open.`)
		}

		openSegments.add(selected.key)
	}

	return openSegments
}

function getSegmentMidpointDistanceSquared(segment: TriangleSegment, center: Vec2): number {
	const midpoint = {
		x: (segment.from.x + segment.to.x) / 2,
		y: (segment.from.y + segment.to.y) / 2
	}

	return (midpoint.x - center.x) ** 2 + (midpoint.y - center.y) ** 2
}

function createWallPath(
	transform: TriangleTransform,
	from: Vec2,
	to: Vec2,
	width: number,
	color: string
): Path {
	const start = transform.worldToCanvas(from)
	const end = transform.worldToCanvas(to)

	return new Path(
		[
			['M', start.x, start.y],
			['L', end.x, end.y]
		],
		{
			stroke: color,
			strokeWidth: width,
			strokeLineCap: 'square',
			fill: undefined,
			selectable: false,
			evented: false
		}
	)
}

function createSolutionObject(
	model: MazeModelV1,
	transform: TriangleTransform,
	passages: ReadonlySet<string>,
	options: TriangleMazeRendererOptions
): Path | undefined {
	if (!options.solutionNodeIds || options.solutionNodeIds.length < 2) return undefined

	const points = options.solutionNodeIds.map((nodeId) => {
		const node = model.nodes[nodeId]
		if (!node) throw new Error(`Solution references missing node "${nodeId}".`)

		return transform.worldToCanvas(node.position)
	})

	for (let index = 1; index < options.solutionNodeIds.length; index += 1) {
		const fromNodeId = options.solutionNodeIds[index - 1]
		const toNodeId = options.solutionNodeIds[index]

		if (!hasPassage(passages, fromNodeId, toNodeId)) {
			throw new Error(`Solution hop "${fromNodeId}" to "${toNodeId}" is not a carved passage.`)
		}
	}

	return new Path(
		[
			['M', points[0].x, points[0].y],
			...points.slice(1).map((point) => ['L', point.x, point.y] as ['L', number, number])
		],
		{
			stroke: options.solutionColor ?? '#22c55e',
			strokeWidth: options.solutionWidth ?? 3,
			strokeLineCap: 'round',
			strokeLineJoin: 'round',
			fill: undefined,
			selectable: false,
			evented: false
		}
	)
}

function createFeatureObjects(model: MazeModelV1, transform: TriangleTransform): Circle[] {
	return Object.values(model.features).map((feature) => {
		const center = transform.worldToCanvas(feature.position)

		return new Circle({
			left: center.x,
			top: center.y,
			radius: Math.max(feature.radius * transform.canvasBounds.scale, 5),
			originX: 'center',
			originY: 'center',
			fill: feature.type === 'start' ? '#22c55e' : '#ef4444',
			stroke: '#ffffff',
			strokeWidth: 2,
			selectable: false,
			evented: false
		})
	})
}
