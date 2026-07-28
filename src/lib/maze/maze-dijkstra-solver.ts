import type { MazeModelV1 } from './maze-model'

export interface SolvedMazeSolution {
	status: 'solved'
	nodeIds: string[]
	distance: number
}

export interface UnreachableMazeSolution {
	status: 'unreachable'
	nodeIds: []
	distance: number
}

export type MazeSolution = SolvedMazeSolution | UnreachableMazeSolution

export interface MazeDistanceField {
	distances: ReadonlyMap<string, number>
	maximumDistance: number
}

interface QueueEntry {
	nodeId: string
	distance: number
}

export function solveMazeDijkstra(model: MazeModelV1): MazeSolution {
	const startNodeId = findFeatureNodeId(model, 'start')
	const goalNodeId = findFeatureNodeId(model, 'goal')

	if (startNodeId === goalNodeId) {
		return { status: 'solved', nodeIds: [startNodeId], distance: 0 }
	}

	const traversal = traverseMazeDijkstra(model, startNodeId)
	const distance = traversal.distances.get(goalNodeId)

	if (distance !== undefined) {
		return {
			status: 'solved',
			nodeIds: reconstructPath(traversal.previous, goalNodeId),
			distance
		}
	}

	return { status: 'unreachable', nodeIds: [], distance: Number.POSITIVE_INFINITY }
}

export function calculateMazeDistanceField(model: MazeModelV1): MazeDistanceField {
	const startNodeId = findFeatureNodeId(model, 'start')
	const { distances } = traverseMazeDijkstra(model, startNodeId)

	return {
		distances,
		maximumDistance: Math.max(...distances.values())
	}
}

function traverseMazeDijkstra(
	model: MazeModelV1,
	startNodeId: string
): { distances: Map<string, number>; previous: Map<string, string> } {
	const neighbors = createNeighborIndex(model)
	const distances = new Map<string, number>([[startNodeId, 0]])
	const previous = new Map<string, string>()
	const queue = new MinPriorityQueue()

	queue.push({ nodeId: startNodeId, distance: 0 })

	while (!queue.isEmpty()) {
		const current = queue.pop()

		if (!current || current.distance !== distances.get(current.nodeId)) {
			continue
		}

		for (const neighbor of neighbors.get(current.nodeId) ?? []) {
			const candidateDistance = current.distance + neighbor.distance
			const knownDistance = distances.get(neighbor.nodeId) ?? Number.POSITIVE_INFINITY

			if (candidateDistance >= knownDistance) {
				continue
			}

			distances.set(neighbor.nodeId, candidateDistance)
			previous.set(neighbor.nodeId, current.nodeId)
			queue.push({ nodeId: neighbor.nodeId, distance: candidateDistance })
		}
	}

	return { distances, previous }
}

function findFeatureNodeId(model: MazeModelV1, featureType: 'start' | 'goal'): string {
	const feature = Object.values(model.features).find((candidate) => candidate.type === featureType)

	if (!feature) {
		throw new Error(`MazeModel contains no ${featureType} feature.`)
	}

	let closestNodeId: string | undefined
	let closestDistanceSquared = Number.POSITIVE_INFINITY

	for (const node of Object.values(model.nodes)) {
		const distanceSquared =
			(node.position.x - feature.position.x) ** 2 + (node.position.y - feature.position.y) ** 2

		if (
			distanceSquared < closestDistanceSquared ||
			(distanceSquared === closestDistanceSquared && node.id < (closestNodeId ?? node.id))
		) {
			closestNodeId = node.id
			closestDistanceSquared = distanceSquared
		}
	}

	if (!closestNodeId) {
		throw new Error('MazeModel contains no nodes.')
	}

	return closestNodeId
}

function createNeighborIndex(model: MazeModelV1): Map<string, QueueEntry[]> {
	const neighbors = new Map<string, QueueEntry[]>()

	for (const nodeId of Object.keys(model.nodes)) {
		neighbors.set(nodeId, [])
	}

	for (const edge of Object.values(model.edges)) {
		const from = model.nodes[edge.from]
		const to = model.nodes[edge.to]

		if (!from || !to) {
			throw new Error(`Edge "${edge.id}" references a missing node.`)
		}

		const distance = Math.hypot(to.position.x - from.position.x, to.position.y - from.position.y)

		neighbors.get(from.id)?.push({ nodeId: to.id, distance })
		neighbors.get(to.id)?.push({ nodeId: from.id, distance })
	}

	return neighbors
}

function reconstructPath(previous: Map<string, string>, goalNodeId: string): string[] {
	const path = [goalNodeId]
	let nodeId = goalNodeId

	while (previous.has(nodeId)) {
		nodeId = previous.get(nodeId) as string
		path.push(nodeId)
	}

	return path.reverse()
}

class MinPriorityQueue {
	private readonly values: QueueEntry[] = []

	isEmpty(): boolean {
		return this.values.length === 0
	}

	push(entry: QueueEntry): void {
		this.values.push(entry)
		this.bubbleUp(this.values.length - 1)
	}

	pop(): QueueEntry | undefined {
		const first = this.values[0]
		const last = this.values.pop()

		if (this.values.length > 0 && last) {
			this.values[0] = last
			this.bubbleDown(0)
		}

		return first
	}

	private bubbleUp(index: number): void {
		let child = index

		while (child > 0) {
			const parent = Math.floor((child - 1) / 2)
			if (this.values[parent].distance <= this.values[child].distance) break

			;[this.values[parent], this.values[child]] = [this.values[child], this.values[parent]]
			child = parent
		}
	}

	private bubbleDown(index: number): void {
		let parent = index

		while (true) {
			const left = parent * 2 + 1
			const right = left + 1
			let smallest = parent

			if (
				left < this.values.length &&
				this.values[left].distance < this.values[smallest].distance
			) {
				smallest = left
			}

			if (
				right < this.values.length &&
				this.values[right].distance < this.values[smallest].distance
			) {
				smallest = right
			}

			if (smallest === parent) return

			;[this.values[parent], this.values[smallest]] = [this.values[smallest], this.values[parent]]
			parent = smallest
		}
	}
}
