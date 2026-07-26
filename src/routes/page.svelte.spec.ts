import { page } from 'vitest/browser'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-svelte'
import Page from './+page.svelte'

describe('+page.svelte', () => {
	it('renders the Fabric.js demo', async () => {
		render(Page)

		await expect.element(page.getByLabelText('Fabric.js maze canvas')).toBeInTheDocument()
		await expect.element(page.getByRole('status')).toHaveTextContent('27 walls')
	})
})
