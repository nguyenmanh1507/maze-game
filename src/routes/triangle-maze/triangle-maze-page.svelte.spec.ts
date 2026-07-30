import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TriangleMazePage from './+page.svelte'

const fabric = vi.hoisted(() => {
	class Canvas {
		dispose = vi.fn()
	}

	return { Canvas }
})

const renderer = vi.hoisted(() => ({ renderTriangleMaze: vi.fn() }))

vi.mock('fabric', () => ({ Canvas: fabric.Canvas }))
vi.mock('$lib/maze/triangle-maze-renderer', () => renderer)

describe('triangle maze page', () => {
	afterEach(() => {
		document.body.replaceChildren()
		renderer.renderTriangleMaze.mockClear()
	})

	it('generates the default triangle maze and rejects invalid dimensions without redrawing', async () => {
		const instance = mount(TriangleMazePage, { target: document.body })
		await tick()

		const rows = document.querySelector('#maze-rows') as HTMLInputElement
		const columns = document.querySelector('#maze-columns') as HTMLInputElement
		const generateButton = [...document.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === 'Generate maze'
		) as HTMLButtonElement

		expect(rows.value).toBe('10')
		expect(columns.value).toBe('17')
		expect(renderer.renderTriangleMaze).toHaveBeenCalledOnce()
		const initialRendererOptions = renderer.renderTriangleMaze.mock.calls[0][2]
		const initialEndpoints = initialRendererOptions.openBoundaryNodeIds

		expect(initialEndpoints).toHaveLength(2)
		expect(initialRendererOptions.solutionNodeIds[0]).toBe(initialEndpoints[0])
		expect(initialRendererOptions.solutionNodeIds.at(-1)).toBe(initialEndpoints[1])

		const seed = document.querySelector('#maze-seed') as HTMLInputElement
		seed.value = '42'
		seed.dispatchEvent(new Event('input', { bubbles: true }))
		generateButton.click()
		flushSync()

		expect(renderer.renderTriangleMaze).toHaveBeenCalledTimes(2)

		rows.value = '1'
		rows.dispatchEvent(new Event('input', { bubbles: true }))
		generateButton.click()
		flushSync()

		expect(document.querySelector('[role="alert"]')?.textContent).toContain('between 2 and 30')
		expect(renderer.renderTriangleMaze).toHaveBeenCalledTimes(2)

		await unmount(instance)
	})
})
