import { describe, expect, it } from 'vitest'
import { createTestDraft, expectSpanningTree } from './maze-generator.spec-helpers'
import { generateRecursiveBacktrackerMaze } from './maze-recursive-backtracker-generator'
import { createMaskedGridMaze } from './maze-model'
import { createPolarMaze } from './polar-maze'

describe('generateRecursiveBacktrackerMaze', () => {
	it('generates a connected tree using only orthogonal grid passages', () => {
		const draft = createTestDraft(5, 4)

		expectSpanningTree(generateRecursiveBacktrackerMaze(draft, { seed: 42 }), draft)
	})

	it('is deterministic for a seed and applies the requested passage width', () => {
		const draft = createTestDraft(4, 4)
		const options = { seed: 7, passageWidth: 0.025 }
		const first = generateRecursiveBacktrackerMaze(draft, options)
		const second = generateRecursiveBacktrackerMaze(draft, options)

		expect(first).toEqual(second)
		expect(Object.values(first.edges).every((edge) => edge.width === options.passageWidth)).toBe(
			true
		)
	})

	it('returns the single-cell maze without passages', () => {
		const maze = generateRecursiveBacktrackerMaze(createTestDraft(1, 1), { seed: 1 })

		expect(maze.edges).toEqual({})
	})

	it('generates a connected tree without passages through disabled cells', () => {
		const draft = createMaskedGridMaze({
			mask: {
				rows: 3,
				columns: 4,
				enabled: [
					[true, true, false, false],
					[false, true, true, false],
					[false, true, true, true]
				]
			},
			startCell: { row: 0, column: 0 },
			goalCell: { row: 2, column: 3 }
		})

		const first = generateRecursiveBacktrackerMaze(draft, { seed: 42 })
		const second = generateRecursiveBacktrackerMaze(draft, { seed: 42 })

		expectSpanningTree(first, draft)
		expect(first).toEqual(second)
		expect(Object.values(first.edges).flatMap((edge) => [edge.from, edge.to])).not.toContain(
			'cell:r0:c2'
		)
	})

	it('generates a deterministic spanning tree for a polar topology', () => {
		const draft = createPolarMaze({ rings: 4 })
		const first = generateRecursiveBacktrackerMaze(draft, { seed: 42 })
		const second = generateRecursiveBacktrackerMaze(draft, { seed: 42 })

		expect(first).toEqual(second)
		expect(Object.keys(first.edges)).toHaveLength(draft.topology.nodeIds.length - 1)

		for (const edge of Object.values(first.edges)) {
			expect(draft.topology.neighborsByNodeId[edge.from]).toContain(edge.to)
			expect(draft.topology.neighborsByNodeId[edge.to]).toContain(edge.from)
		}
	})
})
