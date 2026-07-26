import { addPassage, getAllGridCells, getEastCell, getNorthCell, type GridCell } from './helpers'
import { DEFAULT_PASSAGE_WIDTH, type MazeDraft, type MazeModelV1 } from './maze-model'

export type RandomSource = () => number

/**
 * Mulberry32 seeded pseudo-random generator.
 */
export function createSeededRandom(seed: number): RandomSource {
	let state = seed >>> 0

	return () => {
		state += 0x6d2b79f5

		let value = state

		value = Math.imul(value ^ (value >>> 15), value | 1)

		value ^= value + Math.imul(value ^ (value >>> 7), value | 61)

		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
	}
}

function chooseRandom<T>(values: readonly T[], random: RandomSource): T | undefined {
	if (values.length === 0) {
		return undefined
	}

	const index = Math.floor(random() * values.length)

	return values[index]
}

function cloneMazeModel(model: MazeModelV1): MazeModelV1 {
	/*
	 * MazeModelV1 chỉ chứa JSON-compatible data.
	 */
	return JSON.parse(JSON.stringify(model)) as MazeModelV1
}

export interface GenerateMazeOptions {
	seed?: number
	passageWidth?: number
}

export function generateBinaryTreeMaze(
	draft: MazeDraft,
	options: GenerateMazeOptions = {}
): MazeModelV1 {
	const { seed = 12345, passageWidth = DEFAULT_PASSAGE_WIDTH } = options

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

		console.log({ cell, candidates, selected })

		/*
		 * Cell góc Đông Bắc không có North hoặc East,
		 * nên selected sẽ là undefined.
		 */
		if (!selected) continue

		addPassage(result, cell.id, selected.id, { width: passageWidth })
	}

	return result
}
