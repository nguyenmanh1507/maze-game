import { describe, expect, it } from 'vitest'
import { createPolarMaze } from './polar-maze'

describe('createPolarMaze', () => {
	it('creates adaptive rings with a center cell and polar topology', () => {
		const draft = createPolarMaze({ rings: 4 })

		expect(draft.polarLayout.rings.map((ring) => ring.length)).toEqual([1, 6, 12, 24])
		expect(draft.model.features.goal.position).toEqual(draft.model.nodes['polar:r0:s0'].position)
		expect(draft.model.features.start.position).toEqual(draft.model.nodes['polar:r3:s0'].position)

		expect(draft.topology.neighborsByNodeId['polar:r1:s0']).toEqual(
			expect.arrayContaining(['polar:r1:s1', 'polar:r1:s5', 'polar:r0:s0', 'polar:r2:s0'])
		)
		expect(draft.topology.neighborsByNodeId['polar:r0:s0']).toHaveLength(6)
	})
})
