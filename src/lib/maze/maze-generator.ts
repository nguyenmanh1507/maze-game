import type { MazeDraft, MazeModelV1 } from './maze-model'

export interface GenerateMazeOptions {
	seed?: number
	passageWidth?: number
}

export type MazeGenerator = (draft: MazeDraft, options?: GenerateMazeOptions) => MazeModelV1
