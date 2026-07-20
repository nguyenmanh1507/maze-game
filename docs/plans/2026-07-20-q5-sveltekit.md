# q5.js SvelteKit Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Install q5.js and render a small animated maze-inspired q5 canvas on the SvelteKit home page.

**Architecture:** The q5 npm package is loaded only inside Svelte's `onMount` lifecycle, preventing browser-only APIs from running during SSR. `Q5Demo.svelte` owns an instance-mode q5 sketch and its host element; cleanup calls q5's `remove()` method when the component unmounts.

**Tech Stack:** Svelte 5, SvelteKit, TypeScript, q5.js, Vitest Browser, Playwright, pnpm.

---

### Task 1: Add the q5 dependency

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: Install the dependency**

Run: `pnpm add q5`

Expected: `package.json` lists `q5` under `dependencies` and `pnpm-lock.yaml` is updated.

**Step 2: Confirm the published package API**

Run: `node -e "import('q5').then((module) => console.log(Object.keys(module)))"`

Expected: q5 loads without an import error. Use the package's documented global/constructor API from the observed export shape; do not add a CDN script.

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add q5"
```

### Task 2: Add a browser-safe q5 demo component

**Files:**
- Create: `src/lib/Q5Demo.svelte`
- Create: `src/lib/Q5Demo.svelte.spec.ts`

**Step 1: Write the failing browser component test**

Create `src/lib/Q5Demo.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Q5Demo from './Q5Demo.svelte';

describe('Q5Demo.svelte', () => {
	it('renders a labelled host for the q5 canvas', async () => {
		render(Q5Demo);

		await expect.element(page.getByLabelText('Animated maze demo')).toBeInTheDocument();
	});
});
```

**Step 2: Run the new test to verify it fails**

Run: `pnpm test -- --project client src/lib/Q5Demo.svelte.spec.ts`

Expected: FAIL because `Q5Demo.svelte` does not exist.

**Step 3: Implement the minimal component**

Create `src/lib/Q5Demo.svelte`. Use `onMount` and a `bind:this` host element. Dynamically load the npm package inside `onMount`, construct an instance-mode q5 sketch with the host as its parent, create a 480×280 Canvas2D canvas, and draw a dark background, a static maze grid, and one animated accent circle. Return a cleanup callback that calls the instance's `remove()` method.

Use this sketch shape, adapting only the q5 import binding to match Task 1's observed package export:

```ts
const sketch = new Q5((q) => {
	q.setup = () => q.createCanvas(480, 280);
	q.draw = () => {
		q.background('#111827');
		q.stroke('#334155');
		q.strokeWeight(4);
		for (let x = 30; x < q.width; x += 40) q.line(x, 20, x, q.height - 20);
		q.noStroke();
		q.fill('#34d399');
		q.circle(-q.halfWidth + ((q.frameCount * 2) % q.width), 0, 16);
	};
}, host);
```

The host element must be:

```svelte
<div aria-label="Animated maze demo" bind:this={host}></div>
```

**Step 4: Run the component test to verify it passes**

Run: `pnpm test -- --project client src/lib/Q5Demo.svelte.spec.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/Q5Demo.svelte src/lib/Q5Demo.svelte.spec.ts
git commit -m "feat: add q5 maze demo"
```

### Task 3: Embed the demo on the home page

**Files:**
- Modify: `src/routes/+page.svelte`

**Step 1: Write the failing browser test**

Add `src/routes/+page.svelte.spec.ts` that renders the page and asserts that an element labelled `Animated maze demo` appears.

**Step 2: Run the new test to verify it fails**

Run: `pnpm test -- --project client src/routes/+page.svelte.spec.ts`

Expected: FAIL because the page does not yet render `Q5Demo`.

**Step 3: Add the component to the page**

Import `Q5Demo` in `src/routes/+page.svelte` and render it below the existing introductory paragraph:

```svelte
<section class="mt-8">
	<h2 class="mb-3 text-xl font-semibold">q5.js demo</h2>
	<Q5Demo />
</section>
```

**Step 4: Run the page test to verify it passes**

Run: `pnpm test -- --project client src/routes/+page.svelte.spec.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/routes/+page.svelte src/routes/+page.svelte.spec.ts
git commit -m "feat: show q5 demo on home page"
```

### Task 4: Verify the complete integration

**Files:**
- Verify only

**Step 1: Run static checks**

Run: `pnpm check`

Expected: exits 0 with no Svelte or TypeScript errors.

**Step 2: Run all unit tests**

Run: `pnpm test`

Expected: all client and server tests pass.

**Step 3: Run formatting and lint checks**

Run: `pnpm lint`

Expected: exits 0.

**Step 4: Build the production application**

Run: `pnpm build`

Expected: production build completes successfully.

