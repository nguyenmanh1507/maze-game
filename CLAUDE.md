# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm** (`engine-strict=true`).

```sh
pnpm dev                 # vite dev server
pnpm build               # production build (adapter-auto)
pnpm check               # svelte-kit sync + svelte-check (TypeScript)
pnpm lint                # prettier --check ./src && eslint ./src
pnpm format              # prettier --write ./src
pnpm test                # all vitest projects, single run
```

Tests are split into two Vitest projects (see [vite.config.ts](vite.config.ts)):

- `server` — node environment, matches `src/**/*.spec.ts` **except** `*.svelte.spec.ts`. Pure logic.
- `client` — real Chromium via Playwright, matches `src/**/*.svelte.spec.ts`. Component/page tests.

Run a single file (must name the project, otherwise both projects try to claim it):

```sh
pnpm vitest run --project server src/lib/maze/polar-maze.spec.ts
pnpm vitest run --project client src/routes/circle-maze/circle-maze-page.svelte.spec.ts
pnpm vitest run --project server -t 'partial test name'
```

`expect.requireAssertions` is enabled — a test with no assertion fails.

## Git workflow (from AGENTS.md)

- Work directly in the current checkout. Do not create branches or git worktrees.
- Do not stage, commit, push, merge, or open PRs unless explicitly asked. Leave changes unstaged for review.

## Architecture

A SvelteKit 5 (runes-only, enforced in `vite.config.ts`) app that generates and renders mazes onto a Fabric.js canvas. Everything of substance lives in [src/lib/maze/](src/lib/maze/); routes are thin demo pages.

### The pipeline

```
create*Maze(draft)  →  generate*Maze(draft)  →  braidMaze()  →  solveMazeDijkstra()  →  render*Maze(canvas, model)
   grid + topology       carves edges          optional loops     solution/distances      Fabric objects
```

### MazeModelV1 is the only runtime artifact

[maze-model.ts](src/lib/maze/maze-model.ts) defines `MazeModelV1`: plain JSON (`nodes`, `edges`, `features`, `board`) with **no grid concept**. Coordinates are _world_ units centered on the origin (board radius defaults to `0.1`), never pixels — renderers compute the scale. Because it is JSON-only, `cloneMazeModel()` is a `JSON.parse(JSON.stringify(...))`.

Grid knowledge lives only in the _draft_, which is generation-time scaffolding:

- `MazeGraphDraft` = `{ model, topology }` where `topology.neighborsByNodeId` is the **potential** adjacency (walls not yet carved).
- `MazeDraft` extends it with `layout: GridLayout` (rectangular `cells[row][column] → nodeId`).
- Non-rectangular grids each add their own layout field instead: `polarLayout.rings`, `hexLayout.cells`, `triangleLayout.cells`, and store per-cell shape on `node.geometry` (`polar-sector` | `hex` | `triangle`).

### Generators

Contract: `MazeGenerator = (draft, options?) => MazeModelV1` ([maze-generator.ts](src/lib/maze/maze-generator.ts)). They clone the draft's model, reset `edges = {}`, and carve via `addPassage()`. Never mutate the input draft.

The parameter type decides which grids a generator supports:

- Takes `MazeGraphDraft` (only reads `topology`) → works on rectangular, polar, hex, and triangle grids. E.g. `generateRecursiveBacktrackerMaze`.
- Takes `MazeDraft` (reads `layout` rows/columns, north/east neighbors) → rectangular only. E.g. `generateSidewinderMaze`, `generateBinaryTreeMaze`, `generateWilsonMaze`, `generateHuntAndKillMaze`.

Prefer the topology-only form for new algorithms so all grid types get them for free.

### Determinism

All randomness goes through `createSeededRandom(seed)` (mulberry32) in [helpers.ts](src/lib/maze/helpers.ts). Never call `Math.random()` inside lib code — pages pick the seed and pass it down, which is what makes generator tests reproducible. Derived seeds are salted (e.g. `seed ^ BRAID_SEED_SALT`) so the braid step doesn't reuse the generator's stream.

### Renderers

All renderers return a `MazeRenderResult` whose `remove()` deletes only the objects that particular call added, plus a `worldToCanvas()`:

- [maze-renderer.ts](src/lib/maze/maze-renderer.ts) — `renderRectangularMaze` / `renderMaskedGridMaze`. Notable: it receives no layout and **re-infers** the grid from node positions by clustering X/Y coordinates within `coordinateTolerance`. This keeps `MazeModelV1` layout-free but means node positions must stay on a clean lattice; `strictGridEdges` (default true) throws when an edge doesn't join adjacent cells.
- [polar-maze-renderer.ts](src/lib/maze/polar-maze-renderer.ts), [hex-maze-renderer.ts](src/lib/maze/hex-maze-renderer.ts), [triangle-maze-renderer.ts](src/lib/maze/triangle-maze-renderer.ts) — read `node.geometry` directly, so no inference.

Shared Fabric types (`MazeFabricCanvas`, `MazeFabricObject`, `MazeRenderResult`) are exported from `maze-renderer.ts` and re-imported by the others.

### Masks and custom shapes

[maze-mask.ts](src/lib/maze/maze-mask.ts) parses ASCII art (`.` enabled, `#` disabled, exactly one `S` and one `G`) into a `MazeMask`, asserting the enabled cells form one 4-way connected region. `createMaskedGridMaze()` turns that into a sparse `GridLayout` with `undefined` holes; `renderMaskedGridMaze` derives the silhouette from those holes.

### Pages

Each route under [src/routes/](src/routes/) owns its Fabric canvas: create `new FabricCanvas(...)` in `onMount`, `dispose()` in the returned cleanup. Form inputs are `$state` strings parsed by local `parse*` validators that throw; the catch writes to `errorMessage` rendered in `role="alert"`, and stats go in `role="status"`. Follow that shape when adding a page, and register it in [main-nav.svelte](src/lib/main-nav.svelte).

Page tests (`*.svelte.spec.ts`) `mount()` the page and `vi.mock` both `fabric` and the renderer module, then assert on the arguments passed to the renderer/generator rather than on canvas output.

## Conventions

- Prettier: tabs, single quotes, **no semicolons**, print width 100, no trailing commas. Run `pnpm format` rather than hand-formatting.
- Explanatory comments inside `src/lib/maze/` are written in Vietnamese; keep new comments in that language for consistency with surrounding code.
- [docs/](docs/) holds Vietnamese design notes derived from _Mazes for Programmers_ (polar grids, braiding, triangle grids). Read the relevant note before implementing a new grid or algorithm — they explain the intended approach.
- Styling is TailwindCSS v4 + daisyUI, configured entirely in [src/routes/layout.css](src/routes/layout.css) via `@plugin` (no tailwind.config).
