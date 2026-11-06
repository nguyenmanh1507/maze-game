import { Euler, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { clampTiltInput, inputToTargetTilt, stepTilt, tiltToLocalGravity } from './labyrinth-tilt'

describe('labyrinth tilt', () => {
	it('clamps diagonal input to the unit circle', () => {
		const clamped = clampTiltInput({ right: 1, forward: 1 })

		expect(Math.hypot(clamped.right, clamped.forward)).toBeCloseTo(1)
		expect(clampTiltInput({ right: 0.2, forward: -0.3 })).toEqual({ right: 0.2, forward: -0.3 })
	})

	it('maps right/forward input to a tilt that rolls the ball that way', () => {
		const maxTilt = 0.1
		const right = tiltToLocalGravity(inputToTargetTilt({ right: 1, forward: 0 }, maxTilt), 10)
		const forward = tiltToLocalGravity(inputToTargetTilt({ right: 0, forward: 1 }, maxTilt), 10)

		expect(right.x).toBeGreaterThan(0)
		expect(right.z).toBeCloseTo(0)
		expect(forward.z).toBeLessThan(0)
		expect(forward.x).toBeCloseTo(0)
	})

	it('matches the inverse of the three.js board rotation', () => {
		const tilt = { x: -0.07, z: 0.05 }
		const boardRotation = new Quaternion().setFromEuler(new Euler(tilt.x, 0, tilt.z))
		const expected = new Vector3(0, -981, 0).applyQuaternion(boardRotation.invert())
		const gravity = tiltToLocalGravity(tilt, 981)

		expect(gravity.x).toBeCloseTo(expected.x, 6)
		expect(gravity.y).toBeCloseTo(expected.y, 6)
		expect(gravity.z).toBeCloseTo(expected.z, 6)
	})

	it('eases toward the target without exceeding the max tilt rate', () => {
		const settings = { response: 1000, maxRate: 1 }
		const next = stepTilt({ x: 0, z: 0 }, { x: 0, z: -1 }, 0.1, settings)

		expect(next.x).toBe(0)
		expect(next.z).toBeCloseTo(-0.1)
	})
})
