import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LabyrinthLayout } from '$lib/labyrinth/labyrinth-layout'
import LabyrinthPage from './+page.svelte'

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

async function settle(): Promise<void> {
	await vi.waitFor(() => expect(runtime.game.loadLevel).toHaveBeenCalled())
	await tick()
}

describe('labyrinth page', () => {
	afterEach(() => {
		document.body.replaceChildren()
		for (const fn of Object.values(runtime.game)) fn.mockClear()
		runtime.createLabyrinthGame.mockClear()
		vi.restoreAllMocks()
	})

	it('builds a braided labyrinth from the default settings and loads it into the game', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(42 / 4_294_967_296)

		const instance = mount(LabyrinthPage, { target: document.body })
		await settle()

		const layout = runtime.game.loadLevel.mock.calls[0][0] as LabyrinthLayout

		expect(runtime.createLabyrinthGame).toHaveBeenCalledOnce()
		expect(runtime.createLabyrinthGame.mock.calls[0][1]).toMatchObject({ engine: 'rapier' })
		expect(layout.rows).toBe(8)
		expect(layout.columns).toBe(8)
		expect(layout.startNodeId).toBe('cell:r7:c0')
		expect(layout.goalNodeId).toBe('cell:r0:c7')
		expect(layout.holes.filter((hole) => hole.kind === 'trap')).toHaveLength(4)
		expect(document.querySelector('[role="status"]')?.textContent).toContain('seed 42')
		expect(document.querySelector('a[href*="/labyrinth-jolt?"]')?.getAttribute('href')).toBe(
			'/labyrinth-jolt?rows=8&columns=8&ratio=40&traps=4&seed=42'
		)

		await unmount(instance)
		expect(runtime.game.dispose).toHaveBeenCalledOnce()
	})

	it('reloads the same maze for a fixed seed and rejects invalid sizes', async () => {
		const instance = mount(LabyrinthPage, { target: document.body })
		await settle()

		const seedInput = document.querySelector('#labyrinth-seed') as HTMLInputElement
		const rowsInput = document.querySelector('#labyrinth-rows') as HTMLInputElement
		const form = document.querySelector('form') as HTMLFormElement

		seedInput.value = '7'
		seedInput.dispatchEvent(new Event('input', { bubbles: true }))
		flushSync()
		form.requestSubmit()
		form.requestSubmit()
		flushSync()

		const [, first, second] = runtime.game.loadLevel.mock.calls.map(([layout]) => layout)
		expect(second).toEqual(first)

		rowsInput.value = '50'
		rowsInput.dispatchEvent(new Event('input', { bubbles: true }))
		flushSync()
		form.requestSubmit()
		flushSync()

		expect(runtime.game.loadLevel).toHaveBeenCalledTimes(3)
		expect(document.querySelector('[role="alert"]')?.textContent).toContain(
			'Row count must be between 2 and 20.'
		)

		await unmount(instance)
	})
})
