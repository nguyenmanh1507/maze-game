import {
	addPassage,
	chooseRandom,
	cloneMazeModel,
	createSeededRandom,
	getAllGridCells,
	getEastCell,
	getNorthCell,
	getSouthCell,
	getWestCell,
	type GridCell
} from './helpers'
import type { GenerateMazeOptions } from './maze-generator'
import { DEFAULT_PASSAGE_WIDTH, type MazeDraft, type MazeModelV1 } from './maze-model'

export function generateWilsonMaze(
	draft: MazeDraft,
	options: GenerateMazeOptions = {}
): MazeModelV1 {
	const { seed = 1, passageWidth = DEFAULT_PASSAGE_WIDTH } = options
	const random = createSeededRandom(seed)
	const result = cloneMazeModel(draft.model)
	const cells = getAllGridCells(draft.layout)
	const cellsById = new Map(cells.map((cell) => [cell.id, cell]))
	const unvisited = new Set(cells.map((cell) => cell.id))

	result.edges = {}

	const rootId = chooseRandom([...unvisited], random)

	if (!rootId) {
		return result
	}

	unvisited.delete(rootId)

	while (unvisited.size > 0) {
		const startId = chooseRandom([...unvisited], random)

		if (!startId) {
			throw new Error('Wilson maze has no unvisited start cell.')
		}

		const start = cellsById.get(startId)

		if (!start) {
			throw new Error(`Wilson maze is missing cell ${startId}.`)
		}

		let current = start
		let path = [current]
		const pathIndexes = new Map([[current.id, 0]])

		while (unvisited.has(current.id)) {
			const next = chooseRandom(getOrthogonalNeighbors(draft, current), random)

			if (!next) {
				throw new Error(`Wilson maze cell ${current.id} has no neighbors.`)
			}

			const loopStart = pathIndexes.get(next.id)

			if (loopStart === undefined) {
				pathIndexes.set(next.id, path.length)
				path.push(next)
			} else {
				for (let index = path.length - 1; index > loopStart; index -= 1) {
					pathIndexes.delete(path[index].id)
				}

				path = path.slice(0, loopStart + 1)
			}

			current = next
		}

		for (let index = 0; index < path.length - 1; index += 1) {
			addPassage(result, path[index].id, path[index + 1].id, { width: passageWidth })
			unvisited.delete(path[index].id)
		}
	}

	return result
}

function getOrthogonalNeighbors(draft: MazeDraft, cell: GridCell): GridCell[] {
	return [
		getNorthCell(draft.layout, cell),
		getSouthCell(draft.layout, cell),
		getEastCell(draft.layout, cell),
		getWestCell(draft.layout, cell)
	].filter((neighbor): neighbor is GridCell => neighbor !== undefined)
}
