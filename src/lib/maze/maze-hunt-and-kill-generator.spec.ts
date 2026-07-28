import { describe, expect, it } from 'vitest'
import { createTestDraft, expectSpanningTree } from './maze-generator.spec-helpers'
import { generateHuntAndKillMaze } from './maze-hunt-and-kill-generator'

describe('generateHuntAndKillMaze', () => {
	it('generates a connected tree using only orthogonal grid passages', () => {
		const draft = createTestDraft(5, 4)

		expectSpanningTree(generateHuntAndKillMaze(draft, { seed: 42 }), draft)
	})

	it('is deterministic for a seed and applies the requested passage width', () => {
		const draft = createTestDraft(4, 4)
		const options = { seed: 7, passageWidth: 0.025 }
		const first = generateHuntAndKillMaze(draft, options)
		const second = generateHuntAndKillMaze(draft, options)

		expect(first).toEqual(second)
		expect(Object.values(first.edges).every((edge) => edge.width === options.passageWidth)).toBe(
			true
		)
	})

	it('returns the single-cell maze without passages', () => {
		const maze = generateHuntAndKillMaze(createTestDraft(1, 1), { seed: 1 })

		expect(maze.edges).toEqual({})
	})
})
