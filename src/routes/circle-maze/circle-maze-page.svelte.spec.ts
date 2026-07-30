import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MazeModelV1 } from '$lib/maze/maze-model'
import CircleMazePage from './+page.svelte'

const fabric = vi.hoisted(() => {
	class Canvas {
		dispose = vi.fn()
	}

	return { Canvas }
})

const renderer = vi.hoisted(() => ({ renderPolarMaze: vi.fn() }))
const braider = vi.hoisted(() => ({ braidMaze: vi.fn() }))

vi.mock('fabric', () => ({ Canvas: fabric.Canvas }))
vi.mock('$lib/maze/polar-maze-renderer', () => renderer)
vi.mock('$lib/maze/maze-braid-generator', () => braider)

describe('circle maze page', () => {
	afterEach(() => {
		document.body.replaceChildren()
		renderer.renderPolarMaze.mockClear()
		braider.braidMaze.mockReset()
		vi.restoreAllMocks()
	})

	it('generates the default polar braid profile with protected endpoints and a derived seed', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(42 / 4_294_967_296)
		braider.braidMaze.mockImplementation((source: MazeModelV1) => ({
			model: source,
			initialDeadEndCount: 20,
			eligibleDeadEndCount: 18,
			targetRemovedCount: 7,
			actualRemovedCount: 6,
			finalDeadEndCount: 14,
			addedEdgeIds: ['loop-1', 'loop-2', 'loop-3'],
			targetReached: false
		}))

		const instance = mount(CircleMazePage, { target: document.body })
		await tick()

		const rings = document.querySelector('#maze-rings') as HTMLInputElement
		const ratio = document.querySelector('#braid-ratio') as HTMLInputElement
		const options = braider.braidMaze.mock.calls[0][2]

		expect(rings.value).toBe('12')
		expect(ratio.value).toBe('40')
		expect(options).toMatchObject({
			ratio: 0.4,
			seed: 42 ^ 0x9e3779b9,
			preferDeadEndNeighbors: true,
			preferStraight: true,
			minCycleLength: 8
		})
		expect(options.protectedNodeIds).toEqual(new Set(['polar:r11:s0', 'polar:r0:s0']))
		expect(renderer.renderPolarMaze).toHaveBeenCalledOnce()
		expect(document.querySelector('[role="status"]')?.textContent).toContain(
			'dead ends 20 → 14 · removed 6/7 · 3 loops · seed 42'
		)

		await unmount(instance)
	})

	it('regenerates changed polar braid settings and rejects invalid ratio without redrawing', async () => {
		braider.braidMaze.mockImplementation((source: MazeModelV1) => ({
			model: source,
			initialDeadEndCount: 10,
			eligibleDeadEndCount: 8,
			targetRemovedCount: 2,
			actualRemovedCount: 2,
			finalDeadEndCount: 8,
			addedEdgeIds: ['loop'],
			targetReached: true
		}))

		const instance = mount(CircleMazePage, { target: document.body })
		await tick()

		const rings = document.querySelector('#maze-rings') as HTMLInputElement
		const ratio = document.querySelector('#braid-ratio') as HTMLInputElement
		const seed = document.querySelector('#maze-seed') as HTMLInputElement
		const generateButton = document.querySelector('button[type="submit"]') as HTMLButtonElement

		rings.value = '8'
		rings.dispatchEvent(new Event('input', { bubbles: true }))
		ratio.value = '25'
		ratio.dispatchEvent(new Event('input', { bubbles: true }))
		seed.value = '77'
		seed.dispatchEvent(new Event('input', { bubbles: true }))
		generateButton.click()
		flushSync()

		expect(braider.braidMaze).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({ ratio: 0.25, seed: 77 ^ 0x9e3779b9 })
		)
		expect(renderer.renderPolarMaze).toHaveBeenCalledTimes(2)

		ratio.value = '101'
		ratio.dispatchEvent(new Event('input', { bubbles: true }))
		generateButton.click()
		flushSync()

		expect(document.querySelector('[role="alert"]')?.textContent).toContain('between 0 and 100')
		expect(renderer.renderPolarMaze).toHaveBeenCalledTimes(2)

		ratio.value = '25'
		ratio.dispatchEvent(new Event('input', { bubbles: true }))
		rings.value = '1'
		rings.dispatchEvent(new Event('input', { bubbles: true }))
		generateButton.click()
		flushSync()

		expect(document.querySelector('[role="alert"]')?.textContent).toContain('between 2 and 30')
		expect(renderer.renderPolarMaze).toHaveBeenCalledTimes(2)

		await unmount(instance)
	})
})
