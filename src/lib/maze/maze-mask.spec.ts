import { describe, expect, it } from 'vitest'
import { parseAsciiMazeMask } from './maze-mask'

describe('parseAsciiMazeMask', () => {
	it('parses enabled cells and explicit start and goal coordinates', () => {
		const result = parseAsciiMazeMask(`
#####
#S..#
#.###
#..G#
#####
`)

		expect(result.mask).toEqual({
			rows: 5,
			columns: 5,
			enabled: [
				[false, false, false, false, false],
				[false, true, true, true, false],
				[false, true, false, false, false],
				[false, true, true, true, false],
				[false, false, false, false, false]
			]
		})
		expect(result.startCell).toEqual({ row: 1, column: 1 })
		expect(result.goalCell).toEqual({ row: 3, column: 3 })
	})

	it('rejects malformed, incomplete, and disconnected shapes', () => {
		expect(() => parseAsciiMazeMask('SxG')).toThrow('invalid character')
		expect(() => parseAsciiMazeMask('S.G\n....')).toThrow('must contain exactly 3 cells')
		expect(() => parseAsciiMazeMask('S..')).toThrow('exactly one G')
		expect(() => parseAsciiMazeMask('S#G')).toThrow('4-way connected')
	})
})
