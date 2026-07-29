import { describe, expect, it } from 'vitest'
import { createMaskedGridMaze } from './maze-model'

describe('createMaskedGridMaze', () => {
	it('creates nodes and features only for enabled mask cells', () => {
		const draft = createMaskedGridMaze({
			mask: {
				rows: 2,
				columns: 3,
				enabled: [
					[false, true, false],
					[true, true, true]
				]
			},
			startCell: { row: 1, column: 0 },
			goalCell: { row: 0, column: 1 }
		})

		expect(Object.keys(draft.model.nodes)).toEqual([
			'cell:r0:c1',
			'cell:r1:c0',
			'cell:r1:c1',
			'cell:r1:c2'
		])
		expect(draft.layout.cells).toEqual([
			[undefined, 'cell:r0:c1', undefined],
			['cell:r1:c0', 'cell:r1:c1', 'cell:r1:c2']
		])
		expect(draft.model.features.start.position).toEqual(draft.model.nodes['cell:r1:c0'].position)
		expect(draft.model.features.goal.position).toEqual(draft.model.nodes['cell:r0:c1'].position)
	})
})
