import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CircleMazePage from './+page.svelte'

const fabric = vi.hoisted(() => {
	class Canvas {
		dispose = vi.fn()
	}

	return { Canvas }
})

const renderer = vi.hoisted(() => ({ renderPolarMaze: vi.fn() }))

vi.mock('fabric', () => ({ Canvas: fabric.Canvas }))
vi.mock('$lib/maze/polar-maze-renderer', () => renderer)

describe('circle maze page', () => {
	afterEach(() => {
		document.body.replaceChildren()
		renderer.renderPolarMaze.mockClear()
	})

	it('generates the default circle maze and rejects an invalid ring count without redrawing', async () => {
		const instance = mount(CircleMazePage, { target: document.body })
		await tick()

		const rings = document.querySelector('#maze-rings') as HTMLInputElement
		const generateButton = [...document.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === 'Generate maze'
		) as HTMLButtonElement

		expect(rings.value).toBe('12')
		expect(renderer.renderPolarMaze).toHaveBeenCalledOnce()

		rings.value = '1'
		rings.dispatchEvent(new Event('input', { bubbles: true }))
		generateButton.click()
		flushSync()

		expect(document.querySelector('[role="alert"]')?.textContent).toContain('between 2 and 30')
		expect(renderer.renderPolarMaze).toHaveBeenCalledOnce()

		await unmount(instance)
	})
})
