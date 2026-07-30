import { Circle, Path, Rect } from 'fabric'
import type { MazeFabricCanvas, MazeFabricObject, MazeRenderResult } from './maze-renderer'
import type { HexCellGeometry, MazeModelV1, Vec2 } from './maze-model'

export interface HexMazeRendererOptions {
	padding?: number
	clearCanvas?: boolean
	boardFill?: string
	wallColor?: string
	wallWidth?: number
	outerWallWidth?: number
	solutionNodeIds?: readonly string[]
	solutionColor?: string
	solutionWidth?: number
}

interface HexNode {
	id: string
	position: Vec2
	geometry: HexCellGeometry
}

interface HexTransform {
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

interface HexSegment {
	from: Vec2
	to: Vec2
	nodeIds: string[]
}

export function renderHexMaze(
	canvas: MazeFabricCanvas,
	model: MazeModelV1,
	options: HexMazeRendererOptions = {}
): MazeRenderResult {
	const nodes = getHexNodes(model)
	const transform = createHexTransform(canvas, nodes, options.padding ?? 32)
	const passages = createPassageSet(model)
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

	for (const segment of collectHexSegments(nodes).values()) {
		const [firstNodeId, secondNodeId] = segment.nodeIds
		const isOuterBoundary = secondNodeId === undefined

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

	const solution = createSolutionObject(model, transform, options)
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

function getHexNodes(model: MazeModelV1): HexNode[] {
	const nodes = Object.values(model.nodes).filter(
		(node): node is HexNode => node.geometry?.type === 'hex'
	)

	if (nodes.length === 0 || nodes.length !== Object.keys(model.nodes).length) {
		throw new Error('Hex renderer requires every maze node to have hex geometry.')
	}

	return nodes
}

function createHexTransform(
	canvas: MazeFabricCanvas,
	nodes: HexNode[],
	padding: number
): HexTransform {
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
		throw new Error('Canvas is too small for the configured hex maze.')
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

function collectHexSegments(nodes: HexNode[]): Map<string, HexSegment> {
	const segments = new Map<string, HexSegment>()

	for (const node of nodes) {
		const { vertices } = node.geometry

		for (let index = 0; index < vertices.length; index += 1) {
			const from = vertices[index]
			const to = vertices[(index + 1) % vertices.length]
			const key = createSegmentKey(from, to)
			const segment = segments.get(key)

			if (segment) {
				segment.nodeIds.push(node.id)
				continue
			}

			segments.set(key, { from, to, nodeIds: [node.id] })
		}
	}

	return segments
}

function createSegmentKey(first: Vec2, second: Vec2): string {
	const format = (point: Vec2): string => `${point.x.toFixed(12)},${point.y.toFixed(12)}`

	return [format(first), format(second)].sort().join('|')
}

function createPassageSet(model: MazeModelV1): Set<string> {
	return new Set(Object.values(model.edges).map((edge) => createPairKey(edge.from, edge.to)))
}

function hasPassage(passages: Set<string>, first: string, second: string): boolean {
	return passages.has(createPairKey(first, second))
}

function createPairKey(first: string, second: string): string {
	return [first, second].sort().join(':')
}

function createWallPath(
	transform: HexTransform,
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
	transform: HexTransform,
	options: HexMazeRendererOptions
): Path | undefined {
	if (!options.solutionNodeIds || options.solutionNodeIds.length < 2) return undefined

	const points = options.solutionNodeIds.map((nodeId) => {
		const node = model.nodes[nodeId]
		if (!node) throw new Error(`Solution references missing node "${nodeId}".`)

		return transform.worldToCanvas(node.position)
	})

	return new Path(
		[
			['M', points[0].x, points[0].y],
			...points.slice(1).map((point) => ['L', point.x, point.y] as ['L', number, number])
		],
		{
			stroke: options.solutionColor ?? '#22c55e',
			strokeWidth: options.solutionWidth ?? 5,
			strokeLineCap: 'round',
			strokeLineJoin: 'round',
			fill: undefined,
			selectable: false,
			evented: false
		}
	)
}

function createFeatureObjects(model: MazeModelV1, transform: HexTransform): Circle[] {
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
