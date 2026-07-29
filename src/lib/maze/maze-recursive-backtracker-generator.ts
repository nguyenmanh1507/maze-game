import {
	addPassage,
	chooseRandom,
	cloneMazeModel,
	createSeededRandom,
	getAllGridCells,
	getOrthogonalNeighbors
} from './helpers'
import type { GenerateMazeOptions } from './maze-generator'
import { DEFAULT_PASSAGE_WIDTH, type MazeDraft, type MazeModelV1 } from './maze-model'

export function generateRecursiveBacktrackerMaze(
	draft: MazeDraft,
	options: GenerateMazeOptions = {}
): MazeModelV1 {
	const { seed = 1, passageWidth = DEFAULT_PASSAGE_WIDTH } = options
	const random = createSeededRandom(seed)
	const result = cloneMazeModel(draft.model)
	const cells = getAllGridCells(draft.layout)
	const unvisited = new Set(cells.map((cell) => cell.id))

	result.edges = {}

	const start = chooseRandom(cells, random)

	if (!start) {
		return result
	}

	unvisited.delete(start.id)

	const stack = [start]

	while (stack.length > 0) {
		const current = stack.at(-1)

		if (!current) break

		const next = chooseRandom(
			getOrthogonalNeighbors(draft.layout, current).filter((neighbor) =>
				unvisited.has(neighbor.id)
			),
			random
		)

		if (!next) {
			stack.pop()
			continue
		}

		addPassage(result, current.id, next.id, { width: passageWidth })
		unvisited.delete(next.id)
		stack.push(next)
	}

	return result
}
