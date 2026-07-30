## Project overview

- This is a SvelteKit 2 / Svelte 5 TypeScript maze visualizer. UI uses Tailwind CSS, daisyUI, and Fabric.js 7 for canvas rendering.
- Public maze routes are `/`, `/custom-shape`, `/circle-maze`, `/hexa-maze`, `/triangle-maze`, and `/braid-maze`.
- Maze source and tests live in `src/lib/maze`; route components and their browser component tests live together under `src/routes`.

## Maze architecture

- `MazeModelV1` is the runtime model: nodes, carved passage edges, board metadata, and start/goal features.
- `MazeTopology` is the source of physical adjacency. Generation and braiding must use it; never infer possible links from node positions.
- `MazeGraphDraft` combines a blank model with topology. Recursive Backtracker and `braidMaze` support any topology, including polar, hex, and triangle grids.
- Binary Tree, Sidewinder, Hunt-and-Kill, and Wilson remain rectangular-grid algorithms unless they are explicitly generalized with topology-aware behavior.
- Non-rectangular grids own their geometry factories and renderers: `polar-maze*`, `hex-maze*`, and `triangle-maze*`. Do not force them through the rectangular/masked renderer.
- When adding passages, use `addPassage` so IDs, width, and Catmull-Rom path data stay canonical.

## Development and verification

- Use `npm run test` for the complete Vitest suite, including browser component tests.
- Run `npm run check`, `npm run lint`, and `npm run build` after changes that affect application behavior.
- Keep unit tests next to their maze module and route component tests next to the corresponding `+page.svelte`.
- Preserve deterministic generation: user-entered seeds must be safe integers; empty seeds may generate a random value that is then displayed.

## Git workflow

- Work directly in the current checkout.
- Do not create branches or Git worktrees.
- Do not stage, commit, push, merge, or open pull requests unless the user explicitly asks.
- Leave code changes unstaged for user review.
