import {
	addPassage,
	chooseRandom,
	cloneMazeModel,
	createSeededRandom,
	getAllGridCells,
	getEastCell,
	getNorthCell,
	type GridCell
} from './helpers'
import type { GenerateMazeOptions } from './maze-generator'
import { DEFAULT_PASSAGE_WIDTH, type MazeDraft, type MazeModelV1 } from './maze-model'

export function generateBinaryTreeMaze(
	draft: MazeDraft,
	options: GenerateMazeOptions = {}
): MazeModelV1 {
	const { seed = 1, passageWidth = DEFAULT_PASSAGE_WIDTH } = options

	const random = createSeededRandom(seed)
	const result = cloneMazeModel(draft.model)

	/*
	 * Đảm bảo có thể chạy lại algorithm trên cùng blank model.
	 */
	result.edges = {}

	const cells = getAllGridCells(draft.layout)

	for (const cell of cells) {
		const candidates: GridCell[] = []

		const north = getNorthCell(draft.layout, cell)
		const east = getEastCell(draft.layout, cell)

		if (north) {
			candidates.push(north)
		}

		if (east) {
			candidates.push(east)
		}

		const selected = chooseRandom(candidates, random)

		/*
		 * Cell góc Đông Bắc không có North hoặc East,
		 * nên selected sẽ là undefined.
		 */
		if (!selected) continue

		addPassage(result, cell.id, selected.id, { width: passageWidth })
	}

	return result
}
