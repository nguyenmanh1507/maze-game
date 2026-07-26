import { page } from 'vitest/browser'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-svelte'
import FabricDemo from './fabric-demo.svelte'
import { maze1 } from './maze-sample'

describe('fabric-demo.svelte', () => {
	it('renders the supplied maze sample and redraws it on reset', async () => {
		render(FabricDemo, { maze: maze1 })

		await expect.element(page.getByLabelText('Fabric.js maze canvas')).toBeInTheDocument()
		await expect.element(page.getByRole('status')).toHaveTextContent('27 walls')

		await page.getByRole('button', { name: 'Reset' }).click()
		await expect.element(page.getByRole('status')).toHaveTextContent('27 walls')
	})
})
