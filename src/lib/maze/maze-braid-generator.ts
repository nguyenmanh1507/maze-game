import { addPassage, cloneMazeModel, createSeededRandom } from './helpers'
import { DEFAULT_PASSAGE_WIDTH, type MazeModelV1, type MazeTopology, type Vec2 } from './maze-model'

export interface BraidMazeOptions {
	ratio: number
	seed?: number
	preferDeadEndNeighbors?: boolean
	preferStraight?: boolean
	minCycleLength?: number
	maxAddedEdges?: number
	protectedNodeIds?: ReadonlySet<string>
	passageWidth?: number
}

export interface BraidMazeResult {
	model: MazeModelV1
	initialDeadEndCount: number
	eligibleDeadEndCount: number
	targetRemovedCount: number
	actualRemovedCount: number
	finalDeadEndCount: number
	addedEdgeIds: string[]
	targetReached: boolean
}

interface BraidCandidate {
	toNodeId: string
	cycleLength: number
	targetIsDeadEnd: boolean
	removalImpact: 1 | 2
	straightScore: number
	randomTieBreaker: number
}

export function braidMaze(
	source: MazeModelV1,
	topology: MazeTopology,
	options: BraidMazeOptions
): BraidMazeResult {
	const {
		ratio,
		seed = 1,
		preferDeadEndNeighbors = true,
		preferStraight = true,
		minCycleLength = 0,
		maxAddedEdges = Number.POSITIVE_INFINITY,
		protectedNodeIds = new Set<string>(),
		passageWidth = Object.values(source.edges)[0]?.width ?? DEFAULT_PASSAGE_WIDTH
	} = options

	validateOptions({ ratio, seed, minCycleLength, maxAddedEdges, passageWidth })
	validateTopology(source, topology, protectedNodeIds)

	const linked = buildLinkedAdjacency(source, topology)
	assertConnected(source, linked)

	const initialDeadEnds = getDeadEnds(source, linked)
	const eligibleDeadEnds = initialDeadEnds.filter((nodeId) => !protectedNodeIds.has(nodeId))
	const targetRemovedCount = Math.round(eligibleDeadEnds.length * ratio)
	const random = createSeededRandom(seed)
	const worklist = shuffle([...eligibleDeadEnds], random)
	const model = cloneMazeModel(source)
	const addedEdgeIds: string[] = []
	let actualRemovedCount = 0

	for (const fromNodeId of worklist) {
		if (actualRemovedCount >= targetRemovedCount || addedEdgeIds.length >= maxAddedEdges) {
			break
		}

		if (!isDeadEnd(linked, fromNodeId) || protectedNodeIds.has(fromNodeId)) continue

		const remaining = targetRemovedCount - actualRemovedCount
		const candidates = (topology.neighborsByNodeId[fromNodeId] ?? [])
			.filter(
				(toNodeId) =>
					toNodeId !== fromNodeId &&
					!protectedNodeIds.has(toNodeId) &&
					!linked.get(fromNodeId)?.has(toNodeId)
			)
			.map((toNodeId): BraidCandidate | undefined => {
				const existingPathLength = shortestPathLength(linked, fromNodeId, toNodeId)
				if (!Number.isFinite(existingPathLength)) return undefined

				const targetIsDeadEnd = isDeadEnd(linked, toNodeId)
				const removalImpact = targetIsDeadEnd ? 2 : 1

				return {
					toNodeId,
					cycleLength: existingPathLength + 1,
					targetIsDeadEnd,
					removalImpact,
					straightScore: calculateStraightContinuationScore(model, linked, fromNodeId, toNodeId),
					randomTieBreaker: random()
				}
			})
			.filter((candidate): candidate is BraidCandidate => candidate !== undefined)
			.filter(
				(candidate) =>
					candidate.cycleLength >= minCycleLength && candidate.removalImpact <= remaining
			)
			.sort((first, second) =>
				compareCandidates(first, second, preferDeadEndNeighbors, preferStraight)
			)

		const selected = candidates[0]
		if (!selected) continue

		const edgeId = addPassage(model, fromNodeId, selected.toNodeId, { width: passageWidth })
		linked.get(fromNodeId)?.add(selected.toNodeId)
		linked.get(selected.toNodeId)?.add(fromNodeId)
		actualRemovedCount += selected.removalImpact
		addedEdgeIds.push(edgeId)
	}

	const finalDeadEndCount = getDeadEnds(model, linked).length

	return {
		model,
		initialDeadEndCount: initialDeadEnds.length,
		eligibleDeadEndCount: eligibleDeadEnds.length,
		targetRemovedCount,
		actualRemovedCount,
		finalDeadEndCount,
		addedEdgeIds,
		targetReached: actualRemovedCount >= targetRemovedCount
	}
}

function validateOptions(options: {
	ratio: number
	seed: number
	minCycleLength: number
	maxAddedEdges: number
	passageWidth: number
}): void {
	if (!Number.isFinite(options.ratio) || options.ratio < 0 || options.ratio > 1) {
		throw new RangeError('Braid ratio must be between 0 and 1.')
	}

	if (!Number.isSafeInteger(options.seed)) {
		throw new Error('Braid seed must be a safe integer.')
	}

	if (!Number.isInteger(options.minCycleLength) || options.minCycleLength < 0) {
		throw new Error('minCycleLength must be a non-negative integer.')
	}

	if (
		options.maxAddedEdges !== Number.POSITIVE_INFINITY &&
		(!Number.isInteger(options.maxAddedEdges) || options.maxAddedEdges < 0)
	) {
		throw new Error('maxAddedEdges must be a non-negative integer or Infinity.')
	}

	if (!Number.isFinite(options.passageWidth) || options.passageWidth <= 0) {
		throw new Error('passageWidth must be greater than 0.')
	}
}

function validateTopology(
	model: MazeModelV1,
	topology: MazeTopology,
	protectedNodeIds: ReadonlySet<string>
): void {
	const modelNodeIds = Object.keys(model.nodes)
	const topologyNodeIds = new Set(topology.nodeIds)

	if (topologyNodeIds.size !== topology.nodeIds.length) {
		throw new Error('Topology nodeIds must not contain duplicates.')
	}

	for (const nodeId of modelNodeIds) {
		if (!topologyNodeIds.has(nodeId)) {
			throw new Error(`Topology is missing model node "${nodeId}".`)
		}
	}

	for (const nodeId of topology.nodeIds) {
		if (!model.nodes[nodeId]) {
			throw new Error(`Topology references missing node "${nodeId}".`)
		}

		const neighbors = topology.neighborsByNodeId[nodeId]
		if (!neighbors) {
			throw new Error(`Topology is missing neighbors for node "${nodeId}".`)
		}

		if (new Set(neighbors).size !== neighbors.length) {
			throw new Error(`Topology neighbors for "${nodeId}" must not contain duplicates.`)
		}

		for (const neighborId of neighbors) {
			if (neighborId === nodeId) {
				throw new Error(`Topology node "${nodeId}" cannot list itself as a neighbor.`)
			}

			if (!model.nodes[neighborId] || !topologyNodeIds.has(neighborId)) {
				throw new Error(`Topology references missing neighbor "${neighborId}".`)
			}

			if (!topology.neighborsByNodeId[neighborId]?.includes(nodeId)) {
				throw new Error(
					`Topology must be symmetric: "${nodeId}" lists "${neighborId}" but not conversely.`
				)
			}
		}
	}

	for (const protectedNodeId of protectedNodeIds) {
		if (!model.nodes[protectedNodeId]) {
			throw new Error(`Protected node "${protectedNodeId}" does not exist.`)
		}
	}
}

function buildLinkedAdjacency(
	model: MazeModelV1,
	topology: MazeTopology
): Map<string, Set<string>> {
	const linked = new Map(topology.nodeIds.map((nodeId) => [nodeId, new Set<string>()]))

	for (const edge of Object.values(model.edges)) {
		const fromNeighbors = linked.get(edge.from)
		const toNeighbors = linked.get(edge.to)

		if (!fromNeighbors || !toNeighbors) {
			throw new Error(`Edge "${edge.id}" references a missing node.`)
		}

		if (edge.from === edge.to) {
			throw new Error(`Edge "${edge.id}" cannot connect a node to itself.`)
		}

		if (!topology.neighborsByNodeId[edge.from]?.includes(edge.to)) {
			throw new Error(`Edge "${edge.id}" is not a topology edge.`)
		}

		if (fromNeighbors.has(edge.to)) {
			throw new Error(`Maze contains duplicate edges between "${edge.from}" and "${edge.to}".`)
		}

		fromNeighbors.add(edge.to)
		toNeighbors.add(edge.from)
	}

	return linked
}

function assertConnected(
	model: MazeModelV1,
	linked: ReadonlyMap<string, ReadonlySet<string>>
): void {
	const nodeIds = Object.keys(model.nodes)
	if (nodeIds.length <= 1) return

	const visited = new Set([nodeIds[0]])
	const queue = [nodeIds[0]]

	for (let index = 0; index < queue.length; index += 1) {
		for (const neighborId of linked.get(queue[index]) ?? []) {
			if (visited.has(neighborId)) continue
			visited.add(neighborId)
			queue.push(neighborId)
		}
	}

	if (visited.size !== nodeIds.length) {
		throw new Error(`Maze graph is disconnected: visited ${visited.size}/${nodeIds.length} nodes.`)
	}
}

function getDeadEnds(
	model: MazeModelV1,
	linked: ReadonlyMap<string, ReadonlySet<string>>
): string[] {
	return Object.keys(model.nodes).filter((nodeId) => isDeadEnd(linked, nodeId))
}

function isDeadEnd(linked: ReadonlyMap<string, ReadonlySet<string>>, nodeId: string): boolean {
	return linked.get(nodeId)?.size === 1
}

function shuffle<T>(values: T[], random: () => number): T[] {
	for (let index = values.length - 1; index > 0; index -= 1) {
		const targetIndex = Math.floor(random() * (index + 1))
		;[values[index], values[targetIndex]] = [values[targetIndex], values[index]]
	}

	return values
}

function shortestPathLength(
	linked: ReadonlyMap<string, ReadonlySet<string>>,
	startNodeId: string,
	goalNodeId: string
): number {
	if (startNodeId === goalNodeId) return 0

	const visited = new Set([startNodeId])
	const queue = [{ nodeId: startNodeId, distance: 0 }]

	for (let index = 0; index < queue.length; index += 1) {
		const current = queue[index]

		for (const neighborId of linked.get(current.nodeId) ?? []) {
			if (visited.has(neighborId)) continue

			const distance = current.distance + 1
			if (neighborId === goalNodeId) return distance

			visited.add(neighborId)
			queue.push({ nodeId: neighborId, distance })
		}
	}

	return Number.POSITIVE_INFINITY
}

function calculateStraightContinuationScore(
	model: MazeModelV1,
	linked: ReadonlyMap<string, ReadonlySet<string>>,
	fromNodeId: string,
	candidateNodeId: string
): number {
	const existingNeighbors = [...(linked.get(fromNodeId) ?? [])]
	if (existingNeighbors.length !== 1) return 0

	const origin = model.nodes[fromNodeId].position
	const exit = model.nodes[existingNeighbors[0]].position
	const candidate = model.nodes[candidateNodeId].position
	const exitVector = normalize({ x: exit.x - origin.x, y: exit.y - origin.y })
	const candidateVector = normalize({ x: candidate.x - origin.x, y: candidate.y - origin.y })

	return -(exitVector.x * candidateVector.x + exitVector.y * candidateVector.y)
}

function normalize(vector: Vec2): Vec2 {
	const length = Math.hypot(vector.x, vector.y)
	if (length === 0) return { x: 0, y: 0 }

	return { x: vector.x / length, y: vector.y / length }
}

function compareCandidates(
	first: BraidCandidate,
	second: BraidCandidate,
	preferDeadEndNeighbors: boolean,
	preferStraight: boolean
): number {
	if (preferDeadEndNeighbors && first.targetIsDeadEnd !== second.targetIsDeadEnd) {
		return first.targetIsDeadEnd ? -1 : 1
	}

	if (preferStraight && first.straightScore !== second.straightScore) {
		return second.straightScore - first.straightScore
	}

	if (first.randomTieBreaker !== second.randomTieBreaker) {
		return second.randomTieBreaker - first.randomTieBreaker
	}

	return first.toNodeId.localeCompare(second.toNodeId)
}
