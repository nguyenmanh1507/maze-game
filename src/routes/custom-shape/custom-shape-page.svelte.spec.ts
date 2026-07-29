import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CustomShapePage from './+page.svelte'

const fabric = vi.hoisted(() => {
	class Canvas {
		dispose = vi.fn()
	}

	return { Canvas }
})

const renderer = vi.hoisted(() => ({ renderMaskedGridMaze: vi.fn() }))

vi.mock('fabric', () => ({ Canvas: fabric.Canvas }))
vi.mock('$lib/maze/maze-renderer', () => renderer)

describe('custom shape maze page', () => {
	afterEach(() => {
		document.body.replaceChildren()
		renderer.renderMaskedGridMaze.mockClear()
	})

	it('renders the default ASCII sample and rejects invalid input without redrawing', async () => {
		const instance = mount(CustomShapePage, { target: document.body })
		await tick()

		const textarea = document.querySelector('textarea') as HTMLTextAreaElement
		const generateButton = [...document.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === 'Generate maze'
		) as HTMLButtonElement

		expect(textarea.value).toContain('S')
		expect(textarea.value).toContain('G')
		expect(renderer.renderMaskedGridMaze).toHaveBeenCalledOnce()

		textarea.value = 'SxG'
		textarea.dispatchEvent(new Event('input', { bubbles: true }))
		generateButton.click()
		flushSync()

		expect(document.querySelector('[role="alert"]')?.textContent).toContain('invalid character')
		expect(renderer.renderMaskedGridMaze).toHaveBeenCalledOnce()

		await unmount(instance)
	})
})
