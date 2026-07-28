import {
	addPassage,
	chooseRandom,
	cloneMazeModel,
	createSeededRandom,
	getAllGridCells,
	getOrthogonalNeighbors,
	type GridCell
} from './helpers'
import type { GenerateMazeOptions } from './maze-generator'
import {
	DEFAULT_PASSAGE_WIDTH,
	type GridLayout,
	type MazeDraft,
	type MazeModelV1
} from './maze-model'

export function generateHuntAndKillMaze(
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

	let current: GridCell | undefined = start

	while (current) {
		const activeCell: GridCell = current
		const unvisitedNeighbors: GridCell[] = getOrthogonalNeighbors(draft.layout, activeCell).filter(
			(neighbor) => unvisited.has(neighbor.id)
		)

		const next: GridCell | undefined = chooseRandom(unvisitedNeighbors, random)

		if (next) {
			addPassage(result, activeCell.id, next.id, { width: passageWidth })
			unvisited.delete(next.id)
			current = next
			continue
		}

		current = hunt(cells, draft.layout, unvisited, random, result, passageWidth)
	}

	return result
}

function hunt(
	cells: readonly GridCell[],
	layout: GridLayout,
	unvisited: Set<string>,
	random: () => number,
	maze: MazeModelV1,
	passageWidth: number
): GridCell | undefined {
	for (const cell of cells) {
		if (!unvisited.has(cell.id)) continue

		const visitedNeighbors = getOrthogonalNeighbors(layout, cell).filter(
			(neighbor) => !unvisited.has(neighbor.id)
		)
		const neighbor = chooseRandom(visitedNeighbors, random)

		if (!neighbor) continue

		addPassage(maze, cell.id, neighbor.id, { width: passageWidth })
		unvisited.delete(cell.id)

		return cell
	}

	return undefined
}
