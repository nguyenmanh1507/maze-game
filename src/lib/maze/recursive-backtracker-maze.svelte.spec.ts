import { mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RecursiveBacktrackerMaze from './recursive-backtracker-maze.svelte'

const fabric = vi.hoisted(() => {
	class Canvas {
		dispose = vi.fn()
	}

	return { Canvas }
})

const renderer = vi.hoisted(() => ({ renderRectangularMaze: vi.fn() }))

vi.mock('fabric', () => ({ Canvas: fabric.Canvas }))
vi.mock('./maze-renderer', () => renderer)

describe('RecursiveBacktrackerMaze', () => {
	afterEach(() => {
		document.body.replaceChildren()
		renderer.renderRectangularMaze.mockClear()
	})

	it('renders Recursive Backtracker maze through the shared demo', async () => {
		const instance = mount(RecursiveBacktrackerMaze, { target: document.body })
		await tick()

		expect(document.querySelector('h3')?.textContent).toBe('Recursive Backtracker Maze')
		expect(document.querySelector('[role="status"]')?.textContent).toMatch(
			/99 walls · \d+ dead ends · Solution route enabled/
		)

		await unmount(instance)
	})
})
