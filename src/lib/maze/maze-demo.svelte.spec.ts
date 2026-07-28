import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateBinaryTreeMaze } from './maze-binary-tree-generator'
import type { MazeDraft, MazeModelV1 } from './maze-model'
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

function generateMaze(draft: MazeDraft, options: { seed: number }): MazeModelV1 {
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

describe('MazeDemo', () => {
	afterEach(() => {
		document.body.replaceChildren()
		fabric.dispose.mockClear()
		renderer.renderRectangularMaze.mockClear()
	})

	it('renders the generated maze status and switches to the distance heatmap', async () => {
		const instance = mount(MazeDemo, {
			target: document.body,
			props: { title: 'Reusable maze', generateMaze }
		})
		await tick()

		expect(document.querySelector('h3')?.textContent).toBe('Reusable maze')
		expect(document.querySelector('[role="status"]')?.textContent).toContain(
			'99 walls · Solution route enabled'
		)

		getButton('Tô màu theo khoảng cách').click()
		flushSync()

		expect(getButton('Tô màu theo khoảng cách')).toHaveAttribute('aria-pressed', 'true')
		expect(document.querySelector('[role="status"]')?.textContent).toContain(
			'99 walls · Distance heatmap enabled'
		)

		await unmount(instance)
	})

	it('redraws the current maze and disposes the Fabric canvas on unmount', async () => {
		const instance = mount(MazeDemo, {
			target: document.body,
			props: { title: 'Reusable maze', generateMaze }
		})
		await tick()
		const initialRenderCount = renderer.renderRectangularMaze.mock.calls.length

		getButton('Reset').click()

		expect(renderer.renderRectangularMaze).toHaveBeenCalledTimes(initialRenderCount + 1)

		await unmount(instance)

		expect(fabric.dispose).toHaveBeenCalledOnce()
	})
})
