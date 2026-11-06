import RAPIER from '@dimforge/rapier3d-compat'
import type { LabyrinthLayout } from './labyrinth-layout'
import {
	createFloorCollisionMesh,
	getLidBox,
	LABYRINTH_FIXED_TIMESTEP,
	LABYRINTH_GRAVITY,
	LABYRINTH_MATERIALS,
	LabyrinthBallWorld,
	type LabyrinthPhysicsEngine,
	type LabyrinthPhysicsTuning,
	type QuatLike,
	type Vec3Like
} from './labyrinth-physics'

let rapierReady: Promise<void> | undefined

export async function loadRapierEngine(): Promise<LabyrinthPhysicsEngine> {
	rapierReady ??= RAPIER.init()
	await rapierReady

	return {
		id: 'rapier',
		label: 'Rapier',
		createWorld: (layout, tuning) => new RapierLabyrinthWorld(layout, tuning)
	}
}

export class RapierLabyrinthWorld extends LabyrinthBallWorld {
	private readonly world: RAPIER.World
	private readonly ball: RAPIER.RigidBody
	private readonly ballCollider: RAPIER.Collider
	private readonly wallColliders: RAPIER.Collider[] = []

	constructor(layout: LabyrinthLayout, tuning: LabyrinthPhysicsTuning) {
		super(layout)
		this.world = new RAPIER.World({ x: 0, y: -LABYRINTH_GRAVITY, z: 0 })
		this.world.timestep = LABYRINTH_FIXED_TIMESTEP

		const board = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
		const floorMesh = createFloorCollisionMesh(layout)

		this.world.createCollider(
			RAPIER.ColliderDesc.trimesh(
				floorMesh.vertices,
				floorMesh.indices,
				RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES
			)
				.setFriction(LABYRINTH_MATERIALS.floorFriction)
				.setRestitution(0)
				/*
				 * Min ưu tiên hơn Average: va chạm bi–sàn không nảy,
				 * còn va chạm bi–tường vẫn dùng wallBounce.
				 */
				.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),
			board
		)

		for (const wall of layout.walls) {
			const collider = this.world.createCollider(
				RAPIER.ColliderDesc.cuboid(wall.size.x / 2, wall.size.y / 2, wall.size.z / 2)
					.setTranslation(wall.center.x, wall.center.y, wall.center.z)
					.setFriction(LABYRINTH_MATERIALS.wallFriction)
					.setRestitution(tuning.wallBounce),
				board
			)
			this.wallColliders.push(collider)
		}

		const lid = getLidBox(layout)
		this.world.createCollider(
			RAPIER.ColliderDesc.cuboid(lid.halfExtents.x, lid.halfExtents.y, lid.halfExtents.z)
				.setTranslation(lid.center.x, lid.center.y, lid.center.z)
				.setFriction(0)
				.setRestitution(0),
			board
		)

		const spawn = this.spawnPosition()
		this.ball = this.world.createRigidBody(
			RAPIER.RigidBodyDesc.dynamic()
				.setTranslation(spawn.x, spawn.y, spawn.z)
				.setCcdEnabled(true)
				.setCanSleep(false)
				.setLinearDamping(LABYRINTH_MATERIALS.airDrag)
				.setAngularDamping(tuning.rollingResistance)
		)
		this.ballCollider = this.world.createCollider(
			RAPIER.ColliderDesc.ball(layout.ballRadius)
				.setDensity(LABYRINTH_MATERIALS.steelDensity)
				.setFriction(LABYRINTH_MATERIALS.ballFriction)
				.setRestitution(tuning.wallBounce),
			this.ball
		)
	}

	setTuning(tuning: LabyrinthPhysicsTuning): void {
		this.ball.setAngularDamping(tuning.rollingResistance)
		this.ballCollider.setRestitution(tuning.wallBounce)

		for (const collider of this.wallColliders) {
			collider.setRestitution(tuning.wallBounce)
		}
	}

	setGravity(gravity: Vec3Like): void {
		this.world.gravity = { x: gravity.x, y: gravity.y, z: gravity.z }
	}

	step(): void {
		this.world.step()
	}

	get ballPosition(): Vec3Like {
		return this.ball.translation()
	}

	get ballRotation(): QuatLike {
		return this.ball.rotation()
	}

	get ballSpeed(): number {
		const velocity = this.ball.linvel()
		return Math.hypot(velocity.x, velocity.y, velocity.z)
	}

	placeBall(position: Vec3Like): void {
		this.ball.setTranslation(position, true)
		this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true)
		this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true)
	}

	dispose(): void {
		this.world.free()
	}
}
