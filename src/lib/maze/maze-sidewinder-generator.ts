import {
	addPassage,
	chooseRandom,
	cloneMazeModel,
	createSeededRandom,
	getEastCell,
	getGridCell,
	getNorthCell,
	type GridCell
} from './helpers'
import type { GenerateMazeOptions } from './maze-binary-tree-generator'
import { DEFAULT_PASSAGE_WIDTH, type MazeDraft, type MazeModelV1 } from './maze-model'

export interface SidewinderOptions extends GenerateMazeOptions {
	/**
	 * Xác suất đóng run.
	 *
	 * 0.5 tương đương tung đồng xu.
	 * Nhỏ hơn 0.5 tạo horizontal run dài hơn.
	 * Lớn hơn 0.5 tạo run ngắn hơn.
	 */
	closeRunProbability?: number
}

export function generateSidewinderMaze(
	draft: MazeDraft,
	options: SidewinderOptions = {}
): MazeModelV1 {
	const { seed = 1, passageWidth = DEFAULT_PASSAGE_WIDTH, closeRunProbability = 0.5 } = options

	if (closeRunProbability < 0 || closeRunProbability > 1) {
		throw new Error('closeRunProbability must be between 0 and 1')
	}

	const random = createSeededRandom(seed)
	const result = cloneMazeModel(draft.model)

	result.edges = {}

	for (let row = 0; row < draft.layout.rows; row += 1) {
		let run: GridCell[] = []

		for (let column = 0; column < draft.layout.columns; column += 1) {
			const cell = getGridCell(draft.layout, row, column)

			if (!cell) {
				throw new Error(`Missing cell at row=${row}, column=${column}`)
			}

			run.push(cell)

			const atNorthernBoundary = row === 0

			const atEasternBoundary = column === draft.layout.columns - 1

			const randomlyCloseRun = random() < closeRunProbability

			const shouldCloseRun = atEasternBoundary || (!atNorthernBoundary && randomlyCloseRun)

			if (shouldCloseRun) {
				/*
				 * Trên hàng phía Bắc không có North neighbor.
				 * Khi đến eastern boundary, chỉ clear run.
				 */
				if (!atNorthernBoundary) {
					const selected = chooseRandom(run, random)

					if (!selected) {
						throw new Error('Sidewinder run cannot be empty')
					}

					const north = getNorthCell(draft.layout, selected)

					if (!north) {
						throw new Error(`Cell ${selected.id} has no north neighbor`)
					}

					addPassage(result, selected.id, north.id, {
						width: passageWidth
					})
				}

				run = []
			} else {
				const east = getEastCell(draft.layout, cell)

				if (!east) {
					throw new Error(`Cell ${cell.id} has no east neighbor`)
				}

				addPassage(result, cell.id, east.id, {
					width: passageWidth
				})
			}
		}
	}

	return result
}
