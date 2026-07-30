import { Circle, Path } from 'fabric'
import type { MazeFabricCanvas, MazeFabricObject, MazeRenderResult } from './maze-renderer'
import type { MazeModelV1, PolarSectorGeometry, Vec2 } from './maze-model'

export interface PolarMazeRendererOptions {
	padding?: number
	clearCanvas?: boolean
	boardFill?: string
	wallColor?: string
	wallWidth?: number
	outerWallWidth?: number
	entranceNodeId?: string
	solutionNodeIds?: readonly string[]
	solutionColor?: string
	solutionWidth?: number
}

interface PolarNode {
	id: string
	position: Vec2
	geometry: PolarSectorGeometry
}

interface PolarTransform {
	center: Vec2
	scale: number
	worldToCanvas(position: Vec2): Vec2
}

export function renderPolarMaze(
	canvas: MazeFabricCanvas,
	model: MazeModelV1,
	options: PolarMazeRendererOptions = {}
): MazeRenderResult {
	const nodes = getPolarNodes(model)
	const outerRadius = Math.max(...nodes.map((node) => node.geometry.outerRadius))
	const transform = createPolarTransform(canvas, outerRadius, options.padding ?? 32)
	const passages = createPassageSet(model)
	const nodesByRing = groupNodesByRing(nodes)
	const objects: MazeFabricObject[] = [
		new Circle({
			left: transform.center.x,
			top: transform.center.y,
			radius: outerRadius * transform.scale,
			originX: 'center',
			originY: 'center',
			fill: options.boardFill ?? '#f4f0e8',
			strokeWidth: 0,
			selectable: false,
			evented: false
		})
	]

	const wallColor = options.wallColor ?? '#172033'
	const wallWidth = options.wallWidth ?? 4
	const outerWallWidth = options.outerWallWidth ?? wallWidth

	for (const node of nodes) {
		const { geometry } = node
		const currentRing = nodesByRing.get(geometry.ring) ?? []
		const clockwise = currentRing[(geometry.sector + 1) % currentRing.length]
		const inward = findInwardNode(node, nodesByRing.get(geometry.ring - 1) ?? [])

		if (geometry.ring > 0 && (!inward || !hasPassage(passages, node.id, inward.id))) {
			objects.push(createArcWall(transform, geometry, geometry.innerRadius, wallWidth, wallColor))
		}

		if (currentRing.length > 1 && (!clockwise || !hasPassage(passages, node.id, clockwise.id))) {
			objects.push(createRadialWall(transform, geometry, wallWidth, wallColor))
		}

		if (geometry.outerRadius === outerRadius && node.id !== options.entranceNodeId) {
			objects.push(
				createArcWall(transform, geometry, geometry.outerRadius, outerWallWidth, wallColor)
			)
		}
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
		rows: nodesByRing.size,
		columns: Math.max(...[...nodesByRing.values()].map((ring) => ring.length)),
		worldBounds: {
			left: -outerRadius,
			right: outerRadius,
			top: outerRadius,
			bottom: -outerRadius,
			width: outerRadius * 2,
			height: outerRadius * 2
		},
		canvasBounds: {
			left: transform.center.x - outerRadius * transform.scale,
			top: transform.center.y - outerRadius * transform.scale,
			width: outerRadius * transform.scale * 2,
			height: outerRadius * transform.scale * 2,
			scale: transform.scale
		},
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

function getPolarNodes(model: MazeModelV1): PolarNode[] {
	const nodes = Object.values(model.nodes).filter(
		(node): node is PolarNode => node.geometry?.type === 'polar-sector'
	)

	if (nodes.length !== Object.keys(model.nodes).length || nodes.length === 0) {
		throw new Error('Polar renderer requires every maze node to have polar-sector geometry.')
	}

	return nodes
}

function createPolarTransform(
	canvas: MazeFabricCanvas,
	outerRadius: number,
	padding: number
): PolarTransform {
	const size = Math.min(canvas.getWidth(), canvas.getHeight()) - padding * 2

	if (size <= 0) throw new Error('Canvas is too small for the configured padding.')

	const center = { x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 }
	const scale = size / (outerRadius * 2)

	return {
		center,
		scale,
		worldToCanvas(position: Vec2): Vec2 {
			return { x: center.x + position.x * scale, y: center.y - position.y * scale }
		}
	}
}

function groupNodesByRing(nodes: PolarNode[]): Map<number, PolarNode[]> {
	const nodesByRing = new Map<number, PolarNode[]>()

	for (const node of nodes) {
		const ring = nodesByRing.get(node.geometry.ring) ?? []
		ring.push(node)
		nodesByRing.set(node.geometry.ring, ring)
	}

	for (const ring of nodesByRing.values()) {
		ring.sort((left, right) => left.geometry.sector - right.geometry.sector)
	}

	return nodesByRing
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

function findInwardNode(node: PolarNode, innerRing: PolarNode[]): PolarNode | undefined {
	const angle = (node.geometry.startAngle + node.geometry.endAngle) / 2

	return innerRing.find(
		(candidate) => candidate.geometry.startAngle <= angle && candidate.geometry.endAngle >= angle
	)
}

function createArcWall(
	transform: PolarTransform,
	geometry: PolarSectorGeometry,
	radius: number,
	width: number,
	color: string
): Path {
	const start = transform.worldToCanvas(polarToCartesian(radius, geometry.startAngle))
	const end = transform.worldToCanvas(polarToCartesian(radius, geometry.endAngle))
	const canvasRadius = radius * transform.scale
	const largeArcFlag = geometry.endAngle - geometry.startAngle > Math.PI ? 1 : 0

	return new Path(
		`M ${start.x} ${start.y} A ${canvasRadius} ${canvasRadius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
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

function createRadialWall(
	transform: PolarTransform,
	geometry: PolarSectorGeometry,
	width: number,
	color: string
): Path {
	const start = transform.worldToCanvas(polarToCartesian(geometry.innerRadius, geometry.endAngle))
	const end = transform.worldToCanvas(polarToCartesian(geometry.outerRadius, geometry.endAngle))

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

function polarToCartesian(radius: number, angle: number): Vec2 {
	return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
}

function createSolutionObject(
	model: MazeModelV1,
	transform: PolarTransform,
	options: PolarMazeRendererOptions
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

function createFeatureObjects(model: MazeModelV1, transform: PolarTransform): Circle[] {
	return Object.values(model.features).map((feature) => {
		const center = transform.worldToCanvas(feature.position)
		const radius = Math.max(feature.radius * transform.scale, 5)

		return new Circle({
			left: center.x,
			top: center.y,
			radius,
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
