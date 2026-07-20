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
		fabricCanvas.backgroundColor = '#0f172a';
		fabricCanvas.add(
			new fabric.Rect({
				left: 60,
				top: 80,
				width: 150,
				height: 100,
				fill: '#14b8a6',
				rx: 16,
				ry: 16
			}),
			new fabric.Circle({
				left: 300,
				top: 70,
				radius: 52,
				fill: '#fbbf24'
			}),
			new fabric.FabricText('Fabric.js', {
				left: 185,
				top: 230,
				fill: '#f8fafc',
				fontFamily: 'sans-serif',
				fontSize: 32,
				fontWeight: 'bold'
			})
		);
		fabricCanvas.renderAll();
		updateObjectCount();
	}

	function addShape() {
		if (!fabricCanvas || !fabric) return;

		const index = fabricCanvas.getObjects().length - 3;
		fabricCanvas.add(
			new fabric.Rect({
				left: 410 + ((index * 18) % 90),
				top: 150 + ((index * 14) % 80),
				width: 70,
				height: 55,
				fill: '#a78bfa',
				rx: 10,
				ry: 10
			})
		);
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
					backgroundColor: '#0f172a',
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
	<div class="space-y-1">
		<h2 id="fabric-demo-title" class="text-xl font-semibold">Fabric.js demo</h2>
		<p>Drag an object, then use its handles to resize or rotate it.</p>
	</div>

	{#if errorMessage}
		<p class="alert alert-error" role="alert">{errorMessage}</p>
	{:else}
		<div class="overflow-x-auto rounded-box border border-base-300 bg-base-200 p-3">
			<canvas
				bind:this={canvasElement}
				aria-label="Fabric.js editable canvas"
				width="560"
				height="320"
			></canvas>
		</div>

		<div class="flex flex-wrap items-center gap-3">
			<button class="btn btn-primary" type="button" onclick={addShape} disabled={!isReady}>
				Add shape
			</button>
			<button class="btn" type="button" onclick={createStarterScene} disabled={!isReady}
				>Reset</button
			>
			<p role="status" aria-live="polite">
				{isReady ? `${objectCount} editable objects` : 'Loading canvas…'}
			</p>
		</div>
	{/if}
</section>
