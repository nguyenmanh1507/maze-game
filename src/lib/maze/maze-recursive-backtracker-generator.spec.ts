import { describe, expect, it } from 'vitest'
import { createTestDraft, expectSpanningTree } from './maze-generator.spec-helpers'
import { generateRecursiveBacktrackerMaze } from './maze-recursive-backtracker-generator'

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
})
