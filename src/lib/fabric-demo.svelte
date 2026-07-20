<script lang="ts">
	import { onMount } from 'svelte';
	import type { Canvas } from 'fabric';

	type FabricModule = Pick<typeof import('fabric'), 'Circle' | 'FabricText' | 'Rect'>;

	let canvasElement = $state<HTMLCanvasElement>();
	let fabricCanvas: Canvas | undefined;
	let fabric: FabricModule | undefined;
	let objectCount = $state(0);
	let errorMessage = $state('');
	let isReady = $state(false);

	function updateObjectCount() {
		objectCount = fabricCanvas?.getObjects().length ?? 0;
	}

	function createStarterScene() {
		if (!fabricCanvas || !fabric) return;

		fabricCanvas.discardActiveObject();
		fabricCanvas.clear();
		fabricCanvas.backgroundColor = '#f0f0f0';

		fabricCanvas.renderAll();
		updateObjectCount();
	}

	onMount(() => {
		let disposed = false;

		void (async () => {
			try {
				const { Canvas: FabricCanvas, Circle, FabricText, Rect } = await import('fabric');
				if (disposed) return;
				if (!canvasElement) {
					errorMessage = 'The Fabric.js canvas could not be initialized.';
					return;
				}

				fabric = { Circle, FabricText, Rect };
				fabricCanvas = new FabricCanvas(canvasElement, {
					backgroundColor: '#f0f0f0',
					selection: true
				});
				createStarterScene();
				isReady = true;
			} catch {
				errorMessage = 'The Fabric.js canvas could not be loaded.';
			}
		})();

		return () => {
			disposed = true;
			void fabricCanvas?.dispose();
			fabricCanvas = undefined;
		};
	});
</script>

<section class="space-y-4" aria-labelledby="fabric-demo-title">
	{#if errorMessage}
		<p class="alert alert-error" role="alert">{errorMessage}</p>
	{:else}
		<div class="overflow-x-auto rounded-box border border-base-300 bg-base-200 p-3">
			<canvas
				bind:this={canvasElement}
				aria-label="Fabric.js editable canvas"
				width="600"
				height="600"
			>
			</canvas>
		</div>

		<div class="flex flex-wrap items-center gap-3">
			<button class="btn" type="button" onclick={createStarterScene} disabled={!isReady}>
				Reset
			</button>
			<p role="status" aria-live="polite">
				{isReady ? `${objectCount} editable objects` : 'Loading canvas…'}
			</p>
		</div>
	{/if}
</section>
