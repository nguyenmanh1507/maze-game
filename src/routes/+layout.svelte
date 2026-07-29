<script lang="ts">
	import './layout.css'
	import favicon from '$lib/assets/favicon.svg'

	import MainNav from '$lib/main-nav.svelte'

	let { children } = $props()
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<MainNav />

{@render children()}
