# Fabric Path Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Express all Fabric maze line segments as typed SVG `Path` commands compatible with Fabric v7.

**Architecture:** Keep the renderer's existing `Path` objects and style options. Replace raw coordinate arrays with `M` and `L` command tuples so Fabric can parse and type-check the segments. Verify the renderer output using its public API and a narrow canvas test double.

**Tech Stack:** TypeScript, Fabric.js 7, Vitest.

---

### Task 1: Cover and fix Fabric path segment data

**Files:**
- Create: `src/lib/maze/maze-renderer.spec.ts`
- Modify: `src/lib/maze/maze-renderer.ts:628,923`

**Step 1: Write the failing test**

Create a renderer test that supplies a one-cell maze and canvas test double, then asserts each rendered `Path` has a two-command `M`/`L` path.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/maze/maze-renderer.spec.ts`

Expected: FAIL because the current raw numeric path data does not satisfy Fabric's path type.

**Step 3: Write minimal implementation**

Use the following path data in the wall and passage-debug constructors:

```ts
[
	['M', start.x, start.y],
	['L', end.x, end.y]
]
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/maze/maze-renderer.spec.ts`

Expected: PASS.

**Step 5: Run static checking**

Run: `pnpm check`

Expected: the Fabric `Path` type diagnostics are gone; report unrelated pre-existing diagnostics separately.

**Step 6: Leave changes unstaged for review**

Repository instructions prohibit staging or committing unless explicitly requested.
