# q5.js SvelteKit Integration Design

## Goal

Add q5.js as an npm dependency and show a small animated canvas demo on the SvelteKit home page.

## Approach

Use the q5 npm package rather than a remote script or a copied vendor file. The demo will live in a dedicated Svelte component, which creates a q5 instance only after the component mounts in the browser and removes that instance when the component is destroyed. This preserves SvelteKit SSR compatibility and makes the canvas integration reusable for the maze game.

## Component Design

`Q5Demo.svelte` owns a DOM element that q5 uses as its parent. In `onMount`, it dynamically imports q5 and creates an instance-mode sketch. The sketch draws a compact animated maze-inspired visual. The component's cleanup function removes the instance to stop its animation loop and release its canvas during navigation.

The existing home page imports the component and renders it below the introductory content. No global scripts or server-side q5 imports are used.

## Validation

A component test will confirm that the q5 module is loaded only while mounted and that cleanup removes the created instance. `svelte-check`, unit tests, linting, and a production build will validate the integration.
