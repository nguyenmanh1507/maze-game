import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateBinaryTreeMaze } from './maze-binary-tree-generator'
import type { GenerateMazeOptions } from './maze-generator'
import { createBlankGridMaze, type MazeDraft, type MazeModelV1 } from './maze-model'
import MazeDemo from './maze-demo.svelte'

const fabric = vi.hoisted(() => {
	const dispose = vi.fn()

	class Canvas {
		dispose = dispose
	}

	return { Canvas, dispose }
})

const renderer = vi.hoisted(() => ({ renderRectangularMaze: vi.fn() }))

vi.mock('fabric', () => ({ Canvas: fabric.Canvas }))
vi.mock('./maze-renderer', () => renderer)

function generateMaze(draft: MazeDraft, options: GenerateMazeOptions = {}): MazeModelV1 {
	return generateBinaryTreeMaze(draft, options)
}

function getButton(name: string): HTMLButtonElement {
	const button = [...document.querySelectorAll('button')].find(
		(candidate) => candidate.textContent?.trim() === name
	)

	if (!button) {
		throw new Error(`Expected a button named ${name}.`)
	}

	return button as HTMLButtonElement
}

function countDeadEnds(maze: MazeModelV1): number {
	const degreeByNodeId = new Map(Object.keys(maze.nodes).map((nodeId) => [nodeId, 0]))

	for (const edge of Object.values(maze.edges)) {
		degreeByNodeId.set(edge.from, (degreeByNodeId.get(edge.from) ?? 0) + 1)
		degreeByNodeId.set(edge.to, (degreeByNodeId.get(edge.to) ?? 0) + 1)
	}

	return [...degreeByNodeId.values()].filter((degree) => degree === 1).length
}

function getExpectedDeadEndCount(seed: number): number {
	const draft = createBlankGridMaze({
		rows: 10,
		columns: 10,
		boardRadius: 0.1,
		wallHeight: 0.012
	})

	return countDeadEnds(generateBinaryTreeMaze(draft, { seed }))
}

describe('MazeDemo', () => {
	afterEach(() => {
		document.body.replaceChildren()
		vi.restoreAllMocks()
		fabric.dispose.mockClear()
		renderer.renderRectangularMaze.mockClear()
	})

	it('displays the generated maze dead-end count in both render modes', async () => {
		const seed = 42
		const deadEndCount = getExpectedDeadEndCount(seed)
		vi.spyOn(Math, 'random').mockReturnValue(seed / 100)

		const instance = mount(MazeDemo, {
			target: document.body,
			props: { title: 'Reusable maze', generateMaze }
		})
		await tick()

		expect(document.querySelector('h3')?.textContent).toBe('Reusable maze')
		expect(document.querySelector('[role="status"]')?.textContent).toContain(
			`99 walls · ${deadEndCount} dead ends · Solution route enabled`
		)

		getButton('Tô màu theo khoảng cách').click()
		flushSync()

		expect(getButton('Tô màu theo khoảng cách')).toHaveAttribute('aria-pressed', 'true')
		expect(document.querySelector('[role="status"]')?.textContent).toContain(
			`99 walls · ${deadEndCount} dead ends · Distance heatmap enabled`
		)

		await unmount(instance)
	})

	it('redraws the current maze and disposes the Fabric canvas on unmount', async () => {
		const seed = 42
		const deadEndCount = getExpectedDeadEndCount(seed)
		vi.spyOn(Math, 'random').mockReturnValue(seed / 100)

		const instance = mount(MazeDemo, {
			target: document.body,
			props: { title: 'Reusable maze', generateMaze }
		})
		await tick()
		const initialRenderCount = renderer.renderRectangularMaze.mock.calls.length
		const expectedStatus = `99 walls · ${deadEndCount} dead ends · Solution route enabled`

		expect(document.querySelector('[role="status"]')?.textContent).toContain(expectedStatus)

		getButton('Reset').click()

		expect(renderer.renderRectangularMaze).toHaveBeenCalledTimes(initialRenderCount + 1)
		expect(document.querySelector('[role="status"]')?.textContent).toContain(expectedStatus)

		await unmount(instance)

		expect(fabric.dispose).toHaveBeenCalledOnce()
	})
})
