import { mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LabyrinthLayout } from '$lib/labyrinth/labyrinth-layout'
import LabyrinthJoltPage from './+page.svelte'

const runtime = vi.hoisted(() => {
	const game = {
		loadLevel: vi.fn(),
		restart: vi.fn(),
		setTuning: vi.fn(),
		enableDeviceTilt: vi.fn(),
		disableDeviceTilt: vi.fn(),
		dispose: vi.fn()
	}

	return {
		game,
		createLabyrinthGame: vi.fn<(container: HTMLElement, options: unknown) => Promise<typeof game>>(
			async () => game
		)
	}
})

vi.mock('$lib/labyrinth/labyrinth-game', () => ({
	createLabyrinthGame: runtime.createLabyrinthGame
}))

describe('labyrinth jolt page', () => {
	const originalUrl = window.location.href

	afterEach(() => {
		window.history.replaceState(null, '', originalUrl)
		document.body.replaceChildren()
		for (const fn of Object.values(runtime.game)) fn.mockClear()
		runtime.createLabyrinthGame.mockClear()
	})

	it('runs the Jolt engine on the maze described by the URL and links back to Rapier', async () => {
		window.history.replaceState(null, '', '?rows=5&columns=6&ratio=20&traps=2&seed=99')

		const instance = mount(LabyrinthJoltPage, { target: document.body })
		await vi.waitFor(() => expect(runtime.game.loadLevel).toHaveBeenCalled())
		await tick()

		const layout = runtime.game.loadLevel.mock.calls[0][0] as LabyrinthLayout

		expect(runtime.createLabyrinthGame.mock.calls[0][1]).toMatchObject({ engine: 'jolt' })
		expect(layout.rows).toBe(5)
		expect(layout.columns).toBe(6)
		expect(layout.holes.filter((hole) => hole.kind === 'trap')).toHaveLength(2)
		expect(document.querySelector('h1')?.textContent).toContain('Jolt physics')
		expect(document.querySelector('[role="status"]')?.textContent).toContain('seed 99')
		expect(document.querySelector('a[href^="/labyrinth?"]')?.getAttribute('href')).toBe(
			'/labyrinth?rows=5&columns=6&ratio=20&traps=2&seed=99'
		)

		await unmount(instance)
		expect(runtime.game.dispose).toHaveBeenCalledOnce()
	})
})
