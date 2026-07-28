import { mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HuntAndKillMaze from './hunt-and-kill-maze.svelte'

const fabric = vi.hoisted(() => {
	class Canvas {
		dispose = vi.fn()
	}

	return { Canvas }
})

const renderer = vi.hoisted(() => ({ renderRectangularMaze: vi.fn() }))

vi.mock('fabric', () => ({ Canvas: fabric.Canvas }))
vi.mock('./maze-renderer', () => renderer)

describe('HuntAndKillMaze', () => {
	afterEach(() => {
		document.body.replaceChildren()
		renderer.renderRectangularMaze.mockClear()
	})

	it('renders Hunt-and-Kill maze through the shared demo', async () => {
		const instance = mount(HuntAndKillMaze, { target: document.body })
		await tick()

		expect(document.querySelector('h3')?.textContent).toBe('Hunt-and-Kill Maze')
		expect(document.querySelector('[role="status"]')?.textContent).toContain(
			'99 walls · Solution route enabled'
		)

		await unmount(instance)
	})
})
