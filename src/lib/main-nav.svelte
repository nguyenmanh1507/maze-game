<script lang="ts">
	import { resolve } from '$app/paths'
</script>

<div class="navbar bg-base-100 shadow-sm">
	<div class="flex-1">
		<a href={resolve('/')} class="btn btn-ghost text-xl">daisyUI</a>
	</div>
	<div class="flex-none">
		<ul class="menu menu-horizontal px-1">
			<li><a href={resolve('/')}>Home</a></li>
			<li><a href={resolve('/custom-shape')}>Maze Custom Shape</a></li>
			<li><a href={resolve('/circle-maze')}>Circle Maze</a></li>
			<li><a href={resolve('/hexa-maze')}>Hexa Maze</a></li>
			<li><a href={resolve('/triangle-maze')}>Triangle Maze</a></li>
			<li><a href={resolve('/braid-maze')}>Braid Maze</a></li>
			<li><a href={resolve('/labyrinth')}>Labyrinth 3D (Rapier)</a></li>
			<li><a href={resolve('/labyrinth-jolt')}>Labyrinth 3D (Jolt)</a></li>
			<!-- <li>
				<details>
					<summary>Parent</summary>
					<ul class="rounded-t-none bg-base-100 p-2">
						<li><a href={resolve('/')}>Home</a></li>
						<li><a>Link 2</a></li>
					</ul>
				</details>
			</li> -->
		</ul>
	</div>
</div>
