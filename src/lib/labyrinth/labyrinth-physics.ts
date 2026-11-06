import { BufferGeometry, ExtrudeGeometry, Path, Shape } from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import type { LabyrinthHole, LabyrinthLayout } from './labyrinth-layout'

export type LabyrinthEngineId = 'rapier' | 'jolt'

export interface LabyrinthPhysicsTuning {
	/** Góc nghiêng tối đa của board (độ). */
	maxTiltDegrees: number
	/** Angular damping của bi — mô phỏng lực cản lăn giữa bi thép và mặt gỗ. */
	rollingResistance: number
	/** Độ nảy khi bi đập vào tường (0..1). */
	wallBounce: number
}

export const DEFAULT_LABYRINTH_TUNING: LabyrinthPhysicsTuning = {
	maxTiltDegrees: 5,
	rollingResistance: 0.25,
	wallBounce: 0.3
}

/**
 * Đơn vị: centimet, gam, giây — dùng chung cho mọi physics engine
 * để so sánh công bằng.
 * Trọng lực thật = 981 cm/s², bi thép có khối lượng riêng ~7.8 g/cm³.
 */
export const LABYRINTH_GRAVITY = 981
export const LABYRINTH_FIXED_TIMESTEP = 1 / 120
export const LABYRINTH_FLOOR_THICKNESS = 0.6

export const LABYRINTH_MATERIALS = {
	steelDensity: 7.8,
	ballFriction: 0.6,
	floorFriction: 0.6,
	wallFriction: 0.15,
	airDrag: 0.02
} as const

export interface Vec3Like {
	x: number
	y: number
	z: number
}

export interface QuatLike {
	x: number
	y: number
	z: number
	w: number
}

/**
 * Hợp đồng chung mà game loop cần từ một physics engine.
 * Board luôn đứng yên trong physics world; độ nghiêng được thể hiện qua trọng lực.
 */
export interface LabyrinthPhysicsWorld {
	readonly layout: LabyrinthLayout
	readonly ballPosition: Vec3Like
	readonly ballRotation: QuatLike
	readonly ballSpeed: number
	setTuning(tuning: LabyrinthPhysicsTuning): void
	setGravity(gravity: Vec3Like): void
	step(): void
	placeBall(position: Vec3Like): void
	respawn(): void
	hasFallen(): boolean
	nearestHole(): LabyrinthHole | undefined
	dispose(): void
}

export interface LabyrinthPhysicsEngine {
	id: LabyrinthEngineId
	label: string
	createWorld(layout: LabyrinthLayout, tuning: LabyrinthPhysicsTuning): LabyrinthPhysicsWorld
}

/**
 * Phần logic không phụ thuộc engine: vị trí xuất phát, phát hiện rơi, tìm lỗ.
 */
export abstract class LabyrinthBallWorld implements LabyrinthPhysicsWorld {
	readonly layout: LabyrinthLayout

	protected constructor(layout: LabyrinthLayout) {
		this.layout = layout
	}

	abstract get ballPosition(): Vec3Like
	abstract get ballRotation(): QuatLike
	abstract get ballSpeed(): number
	abstract setTuning(tuning: LabyrinthPhysicsTuning): void
	abstract setGravity(gravity: Vec3Like): void
	abstract step(): void
	abstract placeBall(position: Vec3Like): void
	abstract dispose(): void

	respawn(): void {
		this.placeBall(this.spawnPosition())
	}

	/** Bi đã rơi hẳn xuống dưới mặt sàn (qua một lỗ). */
	hasFallen(): boolean {
		return this.ballPosition.y < -(LABYRINTH_FLOOR_THICKNESS + this.layout.ballRadius * 2)
	}

	/** Lỗ gần bi nhất theo phương ngang — dùng để biết bi rơi vào lỗ nào. */
	nearestHole(): LabyrinthHole | undefined {
		const { x, z } = this.ballPosition
		let nearest: LabyrinthHole | undefined
		let nearestDistance = Number.POSITIVE_INFINITY

		for (const hole of this.layout.holes) {
			const distance = Math.hypot(hole.position.x - x, hole.position.z - z)

			if (distance < nearestDistance) {
				nearest = hole
				nearestDistance = distance
			}
		}

		return nearest
	}

	protected spawnPosition(): Vec3Like {
		return { x: this.layout.start.x, y: this.layout.ballRadius + 0.02, z: this.layout.start.z }
	}
}

/**
 * Nắp vô hình: thấp hơn mức bi có thể nhảy qua tường,
 * nhưng đủ cao để bi lăn bình thường bên dưới.
 */
export function getLidBox(layout: LabyrinthLayout): { center: Vec3Like; halfExtents: Vec3Like } {
	const halfThickness = 0.1

	return {
		center: { x: 0, y: layout.ballRadius * 2 + 0.15 + halfThickness, z: 0 },
		halfExtents: { x: layout.width / 2, y: halfThickness, z: layout.depth / 2 }
	}
}

/**
 * Mặt sàn có khoét lỗ: Shape hình chữ nhật trừ đi các hình tròn, extrude xuống dưới.
 * Mặt trên nằm tại y = 0. Dùng chung cho mesh hiển thị và mesh collider.
 */
export function createFloorGeometry(
	layout: LabyrinthLayout,
	thickness = LABYRINTH_FLOOR_THICKNESS
): ExtrudeGeometry {
	const halfWidth = layout.width / 2
	const halfDepth = layout.depth / 2
	const shape = new Shape()

	/*
	 * Shape nằm trên mặt phẳng XY. Sau khi rotateX(-π/2):
	 * (x, y, 0) → (x, 0, -y), nên toạ độ y của shape = -z của board.
	 */
	shape.moveTo(-halfWidth, -halfDepth)
	shape.lineTo(halfWidth, -halfDepth)
	shape.lineTo(halfWidth, halfDepth)
	shape.lineTo(-halfWidth, halfDepth)
	shape.closePath()

	for (const hole of layout.holes) {
		const path = new Path()
		path.absarc(hole.position.x, -hole.position.z, hole.radius, 0, Math.PI * 2, true)
		shape.holes.push(path)
	}

	const geometry = new ExtrudeGeometry(shape, {
		depth: thickness,
		bevelEnabled: false,
		curveSegments: 40
	})
	geometry.rotateX(-Math.PI / 2)
	geometry.translate(0, -thickness, 0)

	return geometry
}

/**
 * Mesh va chạm của sàn dạng có index (tam giác ngược chiều kim đồng hồ khi nhìn từ ngoài).
 *
 * ExtrudeGeometry không có index: mỗi tam giác có đỉnh riêng.
 * Gộp đỉnh trùng để engine biết tam giác nào kề nhau, từ đó loại bỏ được
 * các "gờ ảo" giữa các tam giác trên mặt phẳng sàn (internal edges).
 */
export function createFloorCollisionMesh(layout: LabyrinthLayout): {
	vertices: Float32Array
	indices: Uint32Array
} {
	const floor = createFloorGeometry(layout)
	const positionsOnly = new BufferGeometry()
	positionsOnly.setAttribute('position', floor.getAttribute('position').clone())

	const merged = mergeVertices(positionsOnly, 1e-5)
	const index = merged.getIndex()

	if (!index) throw new Error('Floor collision mesh must be indexed.')

	const mesh = {
		vertices: new Float32Array(merged.getAttribute('position').array),
		indices: new Uint32Array(index.array)
	}

	floor.dispose()
	positionsOnly.dispose()
	merged.dispose()

	return mesh
}
