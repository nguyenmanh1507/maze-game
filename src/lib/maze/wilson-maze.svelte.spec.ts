import { mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WilsonMaze from './wilson-maze.svelte'

const fabric = vi.hoisted(() => {
	class Canvas {
		dispose = vi.fn()
	}

	return { Canvas }
})

const renderer = vi.hoisted(() => ({ renderRectangularMaze: vi.fn() }))

vi.mock('fabric', () => ({ Canvas: fabric.Canvas }))
vi.mock('./maze-renderer', () => renderer)

describe('WilsonMaze', () => {
	afterEach(() => {
		document.body.replaceChildren()
		renderer.renderRectangularMaze.mockClear()
	})

	it('renders Wilson maze through the shared demo', async () => {
		const instance = mount(WilsonMaze, { target: document.body })
		await tick()

		expect(document.querySelector('h3')?.textContent).toBe('Wilson Maze')
		expect(document.querySelector('[role="status"]')?.textContent).toContain(
			'99 walls · Solution route enabled'
		)

		await unmount(instance)
	})
})
