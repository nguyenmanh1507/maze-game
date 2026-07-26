import type { MazeModel } from './maze-model'

const gridSize = 4
const cellSize = 100
const gridOffset = (gridSize * cellSize) / 2

const nodeId = (row: number, column: number) => `node-${row}-${column}`

const nodes = Object.fromEntries(
	Array.from({ length: gridSize + 1 }, (_, row) =>
		Array.from({ length: gridSize + 1 }, (_, column) => {
			const id = nodeId(row, column)
			return [
				id,
				{
					id,
					position: {
						x: column * cellSize - gridOffset,
						y: row * cellSize - gridOffset
					}
				}
			]
		})
	).flat()
)

type WallSegment = [fromRow: number, fromColumn: number, toRow: number, toColumn: number]

const wallSegments: WallSegment[] = [
	[0, 0, 0, 1],
	[0, 1, 0, 2],
	[0, 2, 0, 3],
	[0, 3, 0, 4],
	[4, 0, 4, 1],
	[4, 1, 4, 2],
	[4, 2, 4, 3],
	[4, 3, 4, 4],
	[0, 0, 1, 0],
	[1, 0, 2, 0],
	[2, 0, 3, 0],
	[3, 0, 4, 0],
	[0, 4, 1, 4],
	[1, 4, 2, 4],
	[2, 4, 3, 4],
	[3, 4, 4, 4],
	[1, 1, 1, 2],
	[1, 3, 1, 4],
	[2, 0, 2, 1],
	[2, 2, 2, 3],
	[3, 1, 3, 2],
	[3, 2, 3, 3],
	[0, 2, 1, 2],
	[1, 1, 2, 1],
	[1, 3, 2, 3],
	[2, 2, 3, 2],
	[3, 1, 4, 1]
]

const edges = Object.fromEntries(
	wallSegments.map(([fromRow, fromColumn, toRow, toColumn], index) => {
		const id = `wall-${index + 1}`
		const from = nodeId(fromRow, fromColumn)
		const to = nodeId(toRow, toColumn)
		return [
			id,
			{
				id,
				from,
				to,
				path: {
					type: 'catmull-rom' as const,
					points: [nodes[from].position, nodes[to].position]
				},
				width: 12
			}
		]
	})
)

export const maze1: MazeModel = {
	schemaVersion: 1,
	board: {
		radius: 280,
		wallHeight: 20
	},
	nodes,
	edges,
	features: {
		start: {
			id: 'start',
			type: 'start',
			position: { x: -150, y: -150 },
			radius: 18
		},
		goal: {
			id: 'goal',
			type: 'goal',
			position: { x: 150, y: 150 },
			radius: 18
		},
		hole: {
			id: 'hole',
			type: 'hole',
			position: { x: 50, y: -50 },
			radius: 14
		}
	}
}
