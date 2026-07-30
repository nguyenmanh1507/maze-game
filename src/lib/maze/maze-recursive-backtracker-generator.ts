import { addPassage, chooseRandom, cloneMazeModel, createSeededRandom } from './helpers'
import type { GenerateMazeOptions } from './maze-generator'
import { DEFAULT_PASSAGE_WIDTH, type MazeGraphDraft, type MazeModelV1 } from './maze-model'

export function generateRecursiveBacktrackerMaze(
	draft: MazeGraphDraft,
	options: GenerateMazeOptions = {}
): MazeModelV1 {
	const { seed = 1, passageWidth = DEFAULT_PASSAGE_WIDTH } = options
	const random = createSeededRandom(seed)
	const result = cloneMazeModel(draft.model)
	const unvisited = new Set(draft.topology.nodeIds)

	result.edges = {}

	const startNodeId = chooseRandom(draft.topology.nodeIds, random)

	if (!startNodeId) {
		return result
	}

	unvisited.delete(startNodeId)

	const stack = [startNodeId]

	while (stack.length > 0) {
		const current = stack.at(-1)

		if (!current) break

		const nextNodeId = chooseRandom(
			(draft.topology.neighborsByNodeId[current] ?? []).filter((nodeId) => unvisited.has(nodeId)),
			random
		)

		if (!nextNodeId) {
			stack.pop()
			continue
		}

		addPassage(result, current, nextNodeId, { width: passageWidth })
		unvisited.delete(nextNodeId)
		stack.push(nextNodeId)
	}

	return result
}
