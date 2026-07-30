import { describe, expect, it } from 'vitest'
import { createHexMaze } from './hex-maze'
import { generateRecursiveBacktrackerMaze } from './maze-recursive-backtracker-generator'

describe('createHexMaze', () => {
	it('creates regular hex cells with six-way parity-aware topology', () => {
		const draft = createHexMaze({ rows: 3, columns: 3 })
		const centerNodeId = 'hex:r1:c1'
		const center = draft.model.nodes[centerNodeId]

		expect(draft.hexLayout.cells).toEqual([
			['hex:r0:c0', 'hex:r0:c1', 'hex:r0:c2'],
			['hex:r1:c0', 'hex:r1:c1', 'hex:r1:c2'],
			['hex:r2:c0', 'hex:r2:c1', 'hex:r2:c2']
		])
		expect(center.geometry).toMatchObject({ type: 'hex', row: 1, column: 1 })
		expect(center.geometry?.type === 'hex' ? center.geometry.vertices : []).toHaveLength(6)
		expect(draft.topology.neighborsByNodeId[centerNodeId]).toEqual(
			expect.arrayContaining([
				'hex:r0:c1',
				'hex:r2:c1',
				'hex:r1:c0',
				'hex:r1:c2',
				'hex:r2:c0',
				'hex:r2:c2'
			])
		)
		expect(draft.model.features.start.position).toEqual(draft.model.nodes['hex:r2:c0'].position)
		expect(draft.model.features.goal.position).toEqual(draft.model.nodes['hex:r0:c2'].position)
	})

	it('works with Recursive Backtracker using only hex topology edges', () => {
		const draft = createHexMaze({ rows: 3, columns: 3 })
		const first = generateRecursiveBacktrackerMaze(draft, { seed: 42 })
		const second = generateRecursiveBacktrackerMaze(draft, { seed: 42 })

		expect(first).toEqual(second)
		expect(Object.keys(first.edges)).toHaveLength(8)

		for (const edge of Object.values(first.edges)) {
			expect(draft.topology.neighborsByNodeId[edge.from]).toContain(edge.to)
		}
	})
})
