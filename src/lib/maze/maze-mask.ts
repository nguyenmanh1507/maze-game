export interface MazeMask {
	rows: number
	columns: number
	enabled: boolean[][]
}

export interface MazeCellCoordinate {
	row: number
	column: number
}

export interface ParsedAsciiMazeMask {
	mask: MazeMask
	startCell: MazeCellCoordinate
	goalCell: MazeCellCoordinate
}

const ENABLED_CELL = '.'
const DISABLED_CELL = '#'
const START_CELL = 'S'
const GOAL_CELL = 'G'

export function parseAsciiMazeMask(source: string): ParsedAsciiMazeMask {
	const lines = trimOuterBlankLines(source.replaceAll('\r\n', '\n').split('\n'))

	if (lines.length === 0) {
		throw new Error('Maze shape must contain at least one row.')
	}

	const columns = lines[0].length

	if (columns === 0) {
		throw new Error('Maze shape rows must not be empty.')
	}

	for (const [row, line] of lines.entries()) {
		if (line.length !== columns) {
			throw new Error(`Maze shape row ${row + 1} must contain exactly ${columns} cells.`)
		}
	}

	let startCell: MazeCellCoordinate | undefined
	let goalCell: MazeCellCoordinate | undefined
	const enabled = lines.map((line, row) =>
		[...line].map((character, column) => {
			if (character === DISABLED_CELL) return false
			if (character === ENABLED_CELL) return true

			if (character === START_CELL) {
				if (startCell) {
					throw new Error('Maze shape must contain exactly one S cell.')
				}

				startCell = { row, column }
				return true
			}

			if (character === GOAL_CELL) {
				if (goalCell) {
					throw new Error('Maze shape must contain exactly one G cell.')
				}

				goalCell = { row, column }
				return true
			}

			throw new Error(
				`Maze shape contains invalid character "${character}" at row ${row + 1}, column ${column + 1}.`
			)
		})
	)

	if (!startCell) {
		throw new Error('Maze shape must contain exactly one S cell.')
	}

	if (!goalCell) {
		throw new Error('Maze shape must contain exactly one G cell.')
	}

	const mask: MazeMask = {
		rows: lines.length,
		columns,
		enabled
	}

	assertConnectedMask(mask, startCell)

	return { mask, startCell, goalCell }
}

export function assertConnectedMask(mask: MazeMask, origin: MazeCellCoordinate): void {
	if (!mask.enabled[origin.row]?.[origin.column]) {
		throw new Error('Maze shape start cell must be enabled.')
	}

	const enabledCount = mask.enabled.flat().filter(Boolean).length

	if (enabledCount === 0) {
		throw new Error('Maze shape must contain at least one enabled cell.')
	}

	const visited = new Set<string>([createCoordinateKey(origin)])
	const queue = [origin]

	while (queue.length > 0) {
		const current = queue.shift()

		if (!current) continue

		for (const neighbor of getOrthogonalCoordinates(mask, current)) {
			const key = createCoordinateKey(neighbor)

			if (visited.has(key)) continue

			visited.add(key)
			queue.push(neighbor)
		}
	}

	if (visited.size !== enabledCount) {
		throw new Error('Maze shape enabled cells must form one 4-way connected region.')
	}
}

function trimOuterBlankLines(lines: string[]): string[] {
	let first = 0
	let last = lines.length

	while (first < last && lines[first].trim() === '') first += 1
	while (last > first && lines[last - 1].trim() === '') last -= 1

	return lines.slice(first, last)
}

function getOrthogonalCoordinates(mask: MazeMask, cell: MazeCellCoordinate): MazeCellCoordinate[] {
	return [
		{ row: cell.row - 1, column: cell.column },
		{ row: cell.row + 1, column: cell.column },
		{ row: cell.row, column: cell.column - 1 },
		{ row: cell.row, column: cell.column + 1 }
	].filter((candidate) => mask.enabled[candidate.row]?.[candidate.column] === true)
}

function createCoordinateKey(cell: MazeCellCoordinate): string {
	return `${cell.row}:${cell.column}`
}
