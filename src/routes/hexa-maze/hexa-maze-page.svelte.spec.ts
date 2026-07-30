import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HexaMazePage from './+page.svelte'

const fabric = vi.hoisted(() => {
	class Canvas {
		dispose = vi.fn()
	}

	return { Canvas }
})

const renderer = vi.hoisted(() => ({ renderHexMaze: vi.fn() }))

vi.mock('fabric', () => ({ Canvas: fabric.Canvas }))
vi.mock('$lib/maze/hex-maze-renderer', () => renderer)

describe('hexa maze page', () => {
	afterEach(() => {
		document.body.replaceChildren()
		renderer.renderHexMaze.mockClear()
	})

	it('generates the default hex maze and rejects invalid dimensions without redrawing', async () => {
		const instance = mount(HexaMazePage, { target: document.body })
		await tick()

		const rows = document.querySelector('#maze-rows') as HTMLInputElement
		const columns = document.querySelector('#maze-columns') as HTMLInputElement
		const generateButton = [...document.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === 'Generate maze'
		) as HTMLButtonElement

		expect(rows.value).toBe('10')
		expect(columns.value).toBe('10')
		expect(renderer.renderHexMaze).toHaveBeenCalledOnce()

		rows.value = '1'
		rows.dispatchEvent(new Event('input', { bubbles: true }))
		generateButton.click()
		flushSync()

		expect(document.querySelector('[role="alert"]')?.textContent).toContain('between 2 and 30')
		expect(renderer.renderHexMaze).toHaveBeenCalledOnce()

		await unmount(instance)
	})
})
