import {
	DEFAULT_BOARD_RADIUS,
	DEFAULT_PADDING_RATIO,
	DEFAULT_WALL_HEIGHT,
	type MazeGraphDraft,
	type MazeModelV1,
	type MazeTopology,
	type PolarSectorGeometry
} from './maze-model'
import { cloneVec2 } from './helpers'

export interface PolarLayout {
	rings: string[][]
}

export interface PolarMazeDraft extends MazeGraphDraft {
	polarLayout: PolarLayout
}

export interface CreatePolarMazeOptions {
	rings: number
	boardRadius?: number
	wallHeight?: number
	boardPaddingRatio?: number
}

export function createPolarMaze(options: CreatePolarMazeOptions): PolarMazeDraft {
	const {
		rings,
		boardRadius = DEFAULT_BOARD_RADIUS,
		wallHeight = DEFAULT_WALL_HEIGHT,
		boardPaddingRatio = DEFAULT_PADDING_RATIO
	} = options

	if (!Number.isInteger(rings) || rings < 2) {
		throw new Error('rings must be an integer greater than or equal to 2')
	}

	if (boardRadius <= 0) {
		throw new Error('boardRadius must be greater than 0')
	}

	if (boardPaddingRatio <= 0 || boardPaddingRatio > 1) {
		throw new Error('boardPaddingRatio must be greater than 0 and at most 1')
	}

	const mazeRadius = boardRadius * boardPaddingRatio
	const ringHeight = mazeRadius / rings
	const ringCounts = createRingCounts(rings, ringHeight)
	const nodes: MazeModelV1['nodes'] = {}
	const polarRings = ringCounts.map((count, ring) =>
		Array.from({ length: count }, (_, sector) => {
			const id = createPolarCellId(ring, sector)
			const geometry = createSectorGeometry(ring, sector, count, ringHeight)

			nodes[id] = {
				id,
				position: createSectorCenter(geometry),
				geometry
			}

			return id
		})
	)

	const startNodeId = polarRings.at(-1)?.[0]
	const goalNodeId = polarRings[0][0]

	if (!startNodeId) {
		throw new Error('Polar maze must contain an outer ring.')
	}

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
		topology: createPolarTopology(polarRings),
		polarLayout: { rings: polarRings }
	}
}

function createRingCounts(rings: number, ringHeight: number): number[] {
	const counts = [1]

	for (let ring = 1; ring < rings; ring += 1) {
		const circumference = 2 * Math.PI * ring * ringHeight
		const estimatedCellWidth = circumference / counts[ring - 1]
		const ratio = Math.max(1, Math.round(estimatedCellWidth / ringHeight))

		counts.push(counts[ring - 1] * ratio)
	}

	return counts
}

function createSectorGeometry(
	ring: number,
	sector: number,
	sectorCount: number,
	ringHeight: number
): PolarSectorGeometry {
	const angle = (Math.PI * 2) / sectorCount

	return {
		type: 'polar-sector',
		ring,
		sector,
		innerRadius: ring * ringHeight,
		outerRadius: (ring + 1) * ringHeight,
		startAngle: sector * angle,
		endAngle: (sector + 1) * angle
	}
}

function createSectorCenter(geometry: PolarSectorGeometry): { x: number; y: number } {
	if (geometry.ring === 0) {
		return { x: 0, y: 0 }
	}

	const radius = (geometry.innerRadius + geometry.outerRadius) / 2
	const angle = (geometry.startAngle + geometry.endAngle) / 2

	return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
}

function createPolarTopology(rings: string[][]): MazeTopology {
	const nodeIds = rings.flat()
	const neighborsByNodeId = Object.fromEntries(nodeIds.map((nodeId) => [nodeId, []])) as Record<
		string,
		string[]
	>
	const connect = (fromNodeId: string, toNodeId: string): void => {
		if (fromNodeId === toNodeId || neighborsByNodeId[fromNodeId].includes(toNodeId)) return

		neighborsByNodeId[fromNodeId].push(toNodeId)
		neighborsByNodeId[toNodeId].push(fromNodeId)
	}

	for (let ring = 1; ring < rings.length; ring += 1) {
		const currentRing = rings[ring]
		const innerRing = rings[ring - 1]
		const ratio = currentRing.length / innerRing.length

		for (let sector = 0; sector < currentRing.length; sector += 1) {
			connect(currentRing[sector], currentRing[(sector + 1) % currentRing.length])
			connect(currentRing[sector], innerRing[Math.floor(sector / ratio)])
		}
	}

	return { nodeIds, neighborsByNodeId }
}

function createPolarCellId(ring: number, sector: number): string {
	return `polar:r${ring}:s${sector}`
}
