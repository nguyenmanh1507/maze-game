import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FabricDemo from './FabricDemo.svelte';

describe('FabricDemo.svelte', () => {
	it('creates, adds, and resets editable canvas objects', async () => {
		render(FabricDemo);

		await expect.element(page.getByLabelText('Fabric.js editable canvas')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Add shape' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
		await expect.element(page.getByRole('status')).toHaveTextContent('3 editable objects');

		await page.getByRole('button', { name: 'Add shape' }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent('4 editable objects');

		await page.getByRole('button', { name: 'Reset' }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent('3 editable objects');
	});
});
