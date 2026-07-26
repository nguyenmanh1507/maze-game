import { describe, expect, it } from 'vitest'
import { maze1 } from './maze-sample'

describe('maze1', () => {
	it('defines a 4 by 4 maze grid with a closed perimeter', () => {
		const nodes = Object.values(maze1.nodes)
		const edges = Object.values(maze1.edges)

		expect(nodes).toHaveLength(25)
		expect(new Set(nodes.map((node) => node.position.x)).size).toBe(5)
		expect(new Set(nodes.map((node) => node.position.y)).size).toBe(5)
		expect(edges).toHaveLength(27)
		expect(edges.every((edge) => maze1.nodes[edge.from] && maze1.nodes[edge.to])).toBe(true)
	})

	it('includes a start and a goal feature inside the board', () => {
		const featureTypes = Object.values(maze1.features).map((feature) => feature.type)

		expect(featureTypes).toContain('start')
		expect(featureTypes).toContain('goal')
	})
})
