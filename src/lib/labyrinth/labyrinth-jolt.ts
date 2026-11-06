import Jolt from 'jolt-physics'
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

type JoltApi = typeof Jolt

const LAYER_STATIC = 0
const LAYER_MOVING = 1
const OBJECT_LAYER_COUNT = 2
const BROAD_PHASE_LAYER_COUNT = 2

/*
 * Jolt mặc định dùng bán kính bo góc 0.05 cho box. Ở thang đo centimet
 * ta giảm xuống để cạnh tường gần giống cuboid sắc cạnh của bản Rapier.
 */
const WALL_CONVEX_RADIUS = 0.01

/*
 * Giới hạn mặc định của Jolt (~47 rad/s) quá thấp cho bi bán kính 0.6 cm:
 * lăn 30 cm/s đã cần 50 rad/s. Nếu bị kẹp, bi sẽ trượt thay vì lăn.
 */
const BALL_MAX_ANGULAR_VELOCITY = 2000
const BALL_MAX_LINEAR_VELOCITY = 2000

let joltReady: Promise<JoltApi> | undefined

/**
 * Nạp module WASM của Jolt đúng một lần; mỗi lần gọi `Jolt()` sẽ tạo
 * một heap WASM mới, nên phải cache lại.
 */
export async function loadJoltEngine(): Promise<LabyrinthPhysicsEngine> {
	joltReady ??= Jolt()
	const api = await joltReady

	return {
		id: 'jolt',
		label: 'Jolt',
		createWorld: (layout, tuning) => new JoltLabyrinthWorld(api, layout, tuning)
	}
}

export class JoltLabyrinthWorld extends LabyrinthBallWorld {
	private readonly api: JoltApi
	private readonly jolt: Jolt.JoltInterface
	private readonly bodyInterface: Jolt.BodyInterface
	private readonly physicsSystem: Jolt.PhysicsSystem
	private readonly ball: Jolt.Body
	private readonly walls: Jolt.Body[] = []
	private readonly staticBodies: Jolt.Body[] = []
	private readonly gravity: Jolt.Vec3
	private readonly zero: Jolt.Vec3
	private readonly scratchPosition: Jolt.RVec3

	constructor(api: JoltApi, layout: LabyrinthLayout, tuning: LabyrinthPhysicsTuning) {
		super(layout)
		this.api = api
		this.jolt = createJoltInterface(api)
		this.physicsSystem = this.jolt.GetPhysicsSystem()
		this.bodyInterface = this.physicsSystem.GetBodyInterface()
		this.gravity = new api.Vec3(0, -LABYRINTH_GRAVITY, 0)
		this.zero = new api.Vec3(0, 0, 0)
		this.scratchPosition = new api.RVec3(0, 0, 0)
		this.physicsSystem.SetGravity(this.gravity)

		const floorShape = createFloorShape(api, layout)
		this.staticBodies.push(
			this.addBody(floorShape, { x: 0, y: 0, z: 0 }, 'static', (settings) => {
				settings.mFriction = LABYRINTH_MATERIALS.floorFriction
				/*
				 * Jolt kết hợp restitution bằng max(a, b). Sàn và bi đều = 0
				 * nên bi không nảy trên sàn; tường mang wallBounce.
				 */
				settings.mRestitution = 0
			})
		)
		/* Body đã giữ tham chiếu riêng; trả lại tham chiếu tạm từ createFloorShape. */
		floorShape.Release()

		for (const wall of layout.walls) {
			const body = this.addBody(
				createBoxShape(api, { x: wall.size.x / 2, y: wall.size.y / 2, z: wall.size.z / 2 }),
				wall.center,
				'static',
				(settings) => {
					settings.mFriction = LABYRINTH_MATERIALS.wallFriction
					settings.mRestitution = tuning.wallBounce
				}
			)
			this.walls.push(body)
			this.staticBodies.push(body)
		}

		const lid = getLidBox(layout)
		this.staticBodies.push(
			this.addBody(createBoxShape(api, lid.halfExtents), lid.center, 'static', (settings) => {
				settings.mFriction = 0
				settings.mRestitution = 0
			})
		)

		const ballShape = new api.SphereShape(layout.ballRadius)
		ballShape.SetDensity(LABYRINTH_MATERIALS.steelDensity)

		this.ball = this.addBody(ballShape, this.spawnPosition(), 'dynamic', (settings) => {
			settings.mMotionQuality = api.EMotionQuality_LinearCast
			settings.mAllowSleeping = false
			settings.mEnhancedInternalEdgeRemoval = true
			settings.mFriction = LABYRINTH_MATERIALS.ballFriction
			settings.mRestitution = 0
			settings.mLinearDamping = LABYRINTH_MATERIALS.airDrag
			settings.mAngularDamping = tuning.rollingResistance
			settings.mMaxAngularVelocity = BALL_MAX_ANGULAR_VELOCITY
			settings.mMaxLinearVelocity = BALL_MAX_LINEAR_VELOCITY
		})

		this.physicsSystem.OptimizeBroadPhase()
	}

	setTuning(tuning: LabyrinthPhysicsTuning): void {
		this.ball.GetMotionProperties().SetAngularDamping(tuning.rollingResistance)

		for (const wall of this.walls) {
			wall.SetRestitution(tuning.wallBounce)
		}
	}

	setGravity(gravity: Vec3Like): void {
		this.gravity.Set(gravity.x, gravity.y, gravity.z)
		this.physicsSystem.SetGravity(this.gravity)
	}

	step(): void {
		this.jolt.Step(LABYRINTH_FIXED_TIMESTEP, 1)
	}

	get ballPosition(): Vec3Like {
		const position = this.ball.GetPosition()
		return { x: position.GetX(), y: position.GetY(), z: position.GetZ() }
	}

	get ballRotation(): QuatLike {
		const rotation = this.ball.GetRotation()
		return { x: rotation.GetX(), y: rotation.GetY(), z: rotation.GetZ(), w: rotation.GetW() }
	}

	get ballSpeed(): number {
		const velocity = this.ball.GetLinearVelocity()
		return Math.hypot(velocity.GetX(), velocity.GetY(), velocity.GetZ())
	}

	placeBall(position: Vec3Like): void {
		const id = this.ball.GetID()
		this.scratchPosition.Set(position.x, position.y, position.z)
		this.bodyInterface.SetPosition(id, this.scratchPosition, this.api.EActivation_Activate)
		this.bodyInterface.SetLinearAndAngularVelocity(id, this.zero, this.zero)
	}

	dispose(): void {
		for (const body of [this.ball, ...this.staticBodies]) {
			const id = body.GetID()
			this.bodyInterface.RemoveBody(id)
			this.bodyInterface.DestroyBody(id)
		}

		this.api.destroy(this.gravity)
		this.api.destroy(this.zero)
		this.api.destroy(this.scratchPosition)
		this.api.destroy(this.jolt)
	}

	private addBody(
		shape: Jolt.Shape,
		position: Vec3Like,
		motion: 'static' | 'dynamic',
		configure: (settings: Jolt.BodyCreationSettings) => void
	): Jolt.Body {
		const api = this.api
		const joltPosition = new api.RVec3(position.x, position.y, position.z)
		const rotation = new api.Quat(0, 0, 0, 1)
		const settings = new api.BodyCreationSettings(
			shape,
			joltPosition,
			rotation,
			motion === 'static' ? api.EMotionType_Static : api.EMotionType_Dynamic,
			motion === 'static' ? LAYER_STATIC : LAYER_MOVING
		)

		configure(settings)

		const body = this.bodyInterface.CreateBody(settings)
		this.bodyInterface.AddBody(
			body.GetID(),
			motion === 'static' ? api.EActivation_DontActivate : api.EActivation_Activate
		)

		api.destroy(settings)
		api.destroy(rotation)
		api.destroy(joltPosition)

		return body
	}
}

function createJoltInterface(api: JoltApi): Jolt.JoltInterface {
	const settings = new api.JoltSettings()
	const objectFilter = new api.ObjectLayerPairFilterTable(OBJECT_LAYER_COUNT)
	objectFilter.EnableCollision(LAYER_STATIC, LAYER_MOVING)
	objectFilter.EnableCollision(LAYER_MOVING, LAYER_MOVING)

	const staticBroadPhase = new api.BroadPhaseLayer(0)
	const movingBroadPhase = new api.BroadPhaseLayer(1)
	const broadPhase = new api.BroadPhaseLayerInterfaceTable(
		OBJECT_LAYER_COUNT,
		BROAD_PHASE_LAYER_COUNT
	)
	broadPhase.MapObjectToBroadPhaseLayer(LAYER_STATIC, staticBroadPhase)
	broadPhase.MapObjectToBroadPhaseLayer(LAYER_MOVING, movingBroadPhase)
	api.destroy(staticBroadPhase)
	api.destroy(movingBroadPhase)

	/* JoltInterface nhận quyền sở hữu các filter/layer interface. */
	settings.mObjectLayerPairFilter = objectFilter
	settings.mBroadPhaseLayerInterface = broadPhase
	settings.mObjectVsBroadPhaseLayerFilter = new api.ObjectVsBroadPhaseLayerFilterTable(
		broadPhase,
		BROAD_PHASE_LAYER_COUNT,
		objectFilter,
		OBJECT_LAYER_COUNT
	)

	const jolt = new api.JoltInterface(settings)
	api.destroy(settings)

	return jolt
}

function createBoxShape(api: JoltApi, halfExtents: Vec3Like): Jolt.Shape {
	const extents = new api.Vec3(halfExtents.x, halfExtents.y, halfExtents.z)
	const shape = new api.BoxShape(extents, WALL_CONVEX_RADIUS)
	api.destroy(extents)

	return shape
}

function createFloorShape(api: JoltApi, layout: LabyrinthLayout): Jolt.Shape {
	const { vertices, indices } = createFloorCollisionMesh(layout)
	const vertexList = new api.VertexList()
	const triangleList = new api.IndexedTriangleList()
	const materials = new api.PhysicsMaterialList()

	vertexList.reserve(vertices.length / 3)
	for (let offset = 0; offset < vertices.length; offset += 3) {
		const vertex = new api.Float3(vertices[offset], vertices[offset + 1], vertices[offset + 2])
		vertexList.push_back(vertex)
		api.destroy(vertex)
	}

	triangleList.reserve(indices.length / 3)
	for (let offset = 0; offset < indices.length; offset += 3) {
		const triangle = new api.IndexedTriangle(
			indices[offset],
			indices[offset + 1],
			indices[offset + 2],
			0
		)
		triangleList.push_back(triangle)
		api.destroy(triangle)
	}

	/*
	 * MeshShape của Jolt tự đánh dấu "active edge" giữa các tam giác kề nhau,
	 * tương đương FIX_INTERNAL_EDGES của Rapier.
	 */
	const settings = new api.MeshShapeSettings(vertexList, triangleList, materials)
	const result = settings.Create()

	if (result.HasError()) {
		const message = result.GetError().c_str()
		api.destroy(settings)
		throw new Error(`Jolt floor mesh failed: ${message}`)
	}

	const shape = result.Get()
	/* Giữ một tham chiếu để shape sống sót khi settings (đang cache shape) bị huỷ. */
	shape.AddRef()

	api.destroy(settings)
	api.destroy(vertexList)
	api.destroy(triangleList)
	api.destroy(materials)

	return shape
}
