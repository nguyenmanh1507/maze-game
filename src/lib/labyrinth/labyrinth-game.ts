import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { BoardPoint, LabyrinthLayout } from './labyrinth-layout'
import {
	createFloorGeometry,
	DEFAULT_LABYRINTH_TUNING,
	LABYRINTH_FIXED_TIMESTEP,
	LABYRINTH_FLOOR_THICKNESS,
	LABYRINTH_GRAVITY,
	type LabyrinthEngineId,
	type LabyrinthPhysicsEngine,
	type LabyrinthPhysicsTuning,
	type LabyrinthPhysicsWorld
} from './labyrinth-physics'
import {
	inputToTargetTilt,
	stepTilt,
	tiltToLocalGravity,
	type BoardTilt,
	type TiltInput
} from './labyrinth-tilt'

export type LabyrinthPhase = 'ready' | 'playing' | 'falling' | 'won'

export interface LabyrinthGameStatus {
	phase: LabyrinthPhase
	elapsedSeconds: number
	falls: number
	/** Thời gian trung bình (ms) cho một bước physics cố định — dùng để so sánh engine. */
	physicsStepMs: number
}

export interface LabyrinthGameOptions {
	/** Physics engine mô phỏng bi; mặc định là Rapier. */
	engine?: LabyrinthEngineId
	onStatus?: (status: LabyrinthGameStatus) => void
	tuning?: Partial<LabyrinthPhysicsTuning>
}

export interface LabyrinthGame {
	loadLevel(layout: LabyrinthLayout): void
	restart(): void
	setTuning(tuning: Partial<LabyrinthPhysicsTuning>): void
	/** Gọi sau khi đã xin quyền DeviceOrientation (iOS) từ một thao tác của người dùng. */
	enableDeviceTilt(): void
	disableDeviceTilt(): void
	dispose(): void
}

export async function createLabyrinthGame(
	container: HTMLElement,
	options: LabyrinthGameOptions = {}
): Promise<LabyrinthGame> {
	const engine = await ENGINE_LOADERS[options.engine ?? 'rapier']()
	return new LabyrinthGameRuntime(container, engine, options)
}

/*
 * Import động: mỗi trang chỉ tải module WASM của engine mà nó dùng.
 */
const ENGINE_LOADERS: Record<LabyrinthEngineId, () => Promise<LabyrinthPhysicsEngine>> = {
	rapier: () => import('./labyrinth-rapier').then((module) => module.loadRapierEngine()),
	jolt: () => import('./labyrinth-jolt').then((module) => module.loadJoltEngine())
}

const MAX_SUBSTEPS = 8
const FALL_RESOLVE_SECONDS = 0.45
const STATUS_INTERVAL_SECONDS = 0.1
const STEP_TIME_SMOOTHING = 0.05
const TILT_RESPONSE = { response: 9, maxRate: THREE.MathUtils.degToRad(45) }
const POINTER_FULL_TILT_PIXELS = 140
const DEVICE_FULL_TILT_DEGREES = 18
const GUIDE_LINE_WIDTH = 0.16

const KEY_DIRECTIONS: Record<string, Partial<TiltInput>> = {
	ArrowUp: { forward: 1 },
	KeyW: { forward: 1 },
	ArrowDown: { forward: -1 },
	KeyS: { forward: -1 },
	ArrowLeft: { right: -1 },
	KeyA: { right: -1 },
	ArrowRight: { right: 1 },
	KeyD: { right: 1 }
}

interface LevelScene {
	physics: LabyrinthPhysicsWorld
	boardContent: THREE.Group
	box: THREE.Group
	ball: THREE.Mesh
	disposables: Array<{ dispose(): void }>
}

class LabyrinthGameRuntime implements LabyrinthGame {
	private readonly container: HTMLElement
	private readonly engine: LabyrinthPhysicsEngine
	private readonly onStatus?: (status: LabyrinthGameStatus) => void
	private readonly renderer: THREE.WebGLRenderer
	private readonly scene = new THREE.Scene()
	private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.5, 600)
	private readonly sun = new THREE.DirectionalLight(0xfff1dc, 2.4)
	private readonly board = new THREE.Group()
	private readonly environment: THREE.Texture
	private readonly materials: ReturnType<typeof createMaterials>
	private readonly resizeObserver: ResizeObserver
	private tuning: LabyrinthPhysicsTuning
	private level?: LevelScene

	private tilt: BoardTilt = { x: 0, z: 0 }
	private readonly pressedKeys = new Set<string>()
	private pointerOrigin?: { id: number; x: number; y: number }
	private pointerInput: TiltInput = { right: 0, forward: 0 }
	private deviceInput?: TiltInput
	private deviceNeutral?: { beta: number; gamma: number }

	private phase: LabyrinthPhase = 'ready'
	private elapsedSeconds = 0
	private falls = 0
	private fallTimer = 0
	private accumulator = 0
	private statusTimer = 0
	private physicsStepMs = 0
	private lastFrameTime?: number

	constructor(
		container: HTMLElement,
		engine: LabyrinthPhysicsEngine,
		options: LabyrinthGameOptions
	) {
		this.container = container
		this.engine = engine
		this.onStatus = options.onStatus
		this.tuning = { ...DEFAULT_LABYRINTH_TUNING, ...options.tuning }

		this.renderer = new THREE.WebGLRenderer({ antialias: true })
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
		this.renderer.shadowMap.enabled = true
		this.renderer.shadowMap.type = THREE.PCFShadowMap
		this.renderer.toneMapping = THREE.NeutralToneMapping
		this.renderer.domElement.style.display = 'block'
		this.renderer.domElement.style.width = '100%'
		this.renderer.domElement.style.height = '100%'
		this.renderer.domElement.style.touchAction = 'none'
		this.renderer.domElement.setAttribute('aria-label', 'Labyrinth board')
		container.append(this.renderer.domElement)

		const pmrem = new THREE.PMREMGenerator(this.renderer)
		this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
		pmrem.dispose()

		this.scene.background = new THREE.Color(0x23262d)
		this.scene.environment = this.environment
		this.scene.environmentIntensity = 0.55
		this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x3a2a1c, 0.5))

		this.sun.castShadow = true
		this.sun.shadow.mapSize.set(2048, 2048)
		this.sun.shadow.bias = -0.0004
		this.sun.shadow.normalBias = 0.03
		this.sun.shadow.radius = 3
		this.scene.add(this.sun, this.sun.target, this.board)

		this.materials = createMaterials()

		window.addEventListener('keydown', this.handleKeyDown)
		window.addEventListener('keyup', this.handleKeyUp)
		window.addEventListener('blur', this.handleBlur)
		this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown)
		this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove)
		this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp)
		this.renderer.domElement.addEventListener('pointercancel', this.handlePointerUp)

		this.resizeObserver = new ResizeObserver(() => this.resize())
		this.resizeObserver.observe(container)
		this.resize()

		this.renderer.setAnimationLoop(this.frame)
	}

	loadLevel(layout: LabyrinthLayout): void {
		this.disposeLevel()

		const disposables: Array<{ dispose(): void }> = []
		const physics = this.engine.createWorld(layout, this.tuning)
		const boardContent = buildBoardContent(layout, this.materials, disposables)
		const box = buildOuterBox(layout, this.tuning.maxTiltDegrees, this.materials, disposables)
		const ballGeometry = new THREE.SphereGeometry(layout.ballRadius, 48, 24)
		const ball = new THREE.Mesh(ballGeometry, this.materials.ball)
		disposables.push(ballGeometry)
		ball.castShadow = true
		boardContent.add(ball)

		this.board.add(boardContent)
		this.scene.add(box)
		this.level = { physics, boardContent, box, ball, disposables }
		this.frameCamera(layout)
		this.resetRun()
	}

	restart(): void {
		this.resetRun()
	}

	setTuning(tuning: Partial<LabyrinthPhysicsTuning>): void {
		this.tuning = { ...this.tuning, ...tuning }
		this.level?.physics.setTuning(this.tuning)
	}

	enableDeviceTilt(): void {
		this.deviceNeutral = undefined
		this.deviceInput = { right: 0, forward: 0 }
		window.addEventListener('deviceorientation', this.handleDeviceOrientation)
	}

	disableDeviceTilt(): void {
		window.removeEventListener('deviceorientation', this.handleDeviceOrientation)
		this.deviceInput = undefined
		this.deviceNeutral = undefined
	}

	dispose(): void {
		this.renderer.setAnimationLoop(null)
		this.disableDeviceTilt()
		window.removeEventListener('keydown', this.handleKeyDown)
		window.removeEventListener('keyup', this.handleKeyUp)
		window.removeEventListener('blur', this.handleBlur)
		this.resizeObserver.disconnect()
		this.disposeLevel()

		for (const material of Object.values(this.materials)) material.dispose()

		this.environment.dispose()
		this.renderer.dispose()
		this.renderer.domElement.remove()
	}

	private resetRun(): void {
		this.level?.physics.respawn()
		this.phase = 'ready'
		this.elapsedSeconds = 0
		this.falls = 0
		this.fallTimer = 0
		this.accumulator = 0
		this.emitStatus()
	}

	private disposeLevel(): void {
		if (!this.level) return

		this.board.remove(this.level.boardContent)
		this.scene.remove(this.level.box)
		for (const disposable of this.level.disposables) disposable.dispose()
		this.level.physics.dispose()
		this.level = undefined
	}

	private readonly frame = (time: number): void => {
		const deltaSeconds = Math.min((time - (this.lastFrameTime ?? time)) / 1000, 0.1)
		this.lastFrameTime = time

		const maxTilt = THREE.MathUtils.degToRad(this.tuning.maxTiltDegrees)
		const input = this.currentInput()
		this.tilt = stepTilt(this.tilt, inputToTargetTilt(input, maxTilt), deltaSeconds, TILT_RESPONSE)
		this.board.rotation.set(this.tilt.x, 0, this.tilt.z)

		if (this.level) this.updateLevel(this.level, input, deltaSeconds)

		this.renderer.render(this.scene, this.camera)
	}

	private updateLevel(level: LevelScene, input: TiltInput, deltaSeconds: number): void {
		const { physics, ball } = level

		if (this.phase === 'ready' && (input.right !== 0 || input.forward !== 0)) {
			this.setPhase('playing')
		}

		if (this.phase === 'playing' || this.phase === 'falling') {
			this.elapsedSeconds += deltaSeconds
		}

		if (this.phase !== 'won') {
			physics.setGravity(tiltToLocalGravity(this.tilt, LABYRINTH_GRAVITY))
			this.accumulator += deltaSeconds
			let substeps = 0
			const stepStart = performance.now()

			while (this.accumulator >= LABYRINTH_FIXED_TIMESTEP && substeps < MAX_SUBSTEPS) {
				physics.step()
				this.accumulator -= LABYRINTH_FIXED_TIMESTEP
				substeps += 1
			}

			if (substeps > 0) this.recordStepTime((performance.now() - stepStart) / substeps)
			if (substeps === MAX_SUBSTEPS) this.accumulator = 0

			const position = physics.ballPosition
			const rotation = physics.ballRotation
			ball.position.set(position.x, position.y, position.z)
			ball.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
		}

		if (this.phase !== 'falling' && this.phase !== 'won' && physics.hasFallen()) {
			this.fallTimer = 0
			this.setPhase('falling')
		}

		if (this.phase === 'falling') {
			this.fallTimer += deltaSeconds
			if (this.fallTimer >= FALL_RESOLVE_SECONDS) this.resolveFall(level)
		}

		this.statusTimer += deltaSeconds
		if (this.statusTimer >= STATUS_INTERVAL_SECONDS && this.phase !== 'won') {
			this.emitStatus()
		}
	}

	private resolveFall(level: LevelScene): void {
		const hole = level.physics.nearestHole()

		if (hole?.kind === 'goal') {
			/* Bi nằm gọn trong lỗ đích. */
			level.ball.position.set(
				hole.position.x,
				-level.physics.layout.ballRadius * 0.7,
				hole.position.z
			)
			this.setPhase('won')
			return
		}

		this.falls += 1
		level.physics.respawn()
		this.setPhase('playing')
	}

	private setPhase(phase: LabyrinthPhase): void {
		this.phase = phase
		this.emitStatus()
	}

	private emitStatus(): void {
		this.statusTimer = 0
		this.onStatus?.({
			phase: this.phase,
			elapsedSeconds: this.elapsedSeconds,
			falls: this.falls,
			physicsStepMs: this.physicsStepMs
		})
	}

	/** Trung bình trượt theo hàm mũ để số liệu không nhảy loạn mỗi frame. */
	private recordStepTime(milliseconds: number): void {
		this.physicsStepMs =
			this.physicsStepMs === 0
				? milliseconds
				: this.physicsStepMs + (milliseconds - this.physicsStepMs) * STEP_TIME_SMOOTHING
	}

	private currentInput(): TiltInput {
		if (this.deviceInput) return this.deviceInput
		if (this.pointerOrigin) return this.pointerInput

		const input = { right: 0, forward: 0 }

		for (const code of this.pressedKeys) {
			const direction = KEY_DIRECTIONS[code]
			input.right += direction?.right ?? 0
			input.forward += direction?.forward ?? 0
		}

		return input
	}

	private frameCamera(layout: LabyrinthLayout): void {
		const size = Math.max(layout.width, layout.depth)
		const shadowExtent = size * 0.8

		this.sun.position.set(size * 0.35, size * 1.4, size * 0.55)
		this.sun.shadow.camera.left = -shadowExtent
		this.sun.shadow.camera.right = shadowExtent
		this.sun.shadow.camera.top = shadowExtent
		this.sun.shadow.camera.bottom = -shadowExtent
		this.sun.shadow.camera.near = size * 0.2
		this.sun.shadow.camera.far = size * 3
		this.sun.shadow.camera.updateProjectionMatrix()
		this.resize()
	}

	private resize(): void {
		const width = Math.max(1, this.container.clientWidth)
		const height = Math.max(1, this.container.clientHeight)
		const aspect = width / height
		const layout = this.level?.physics.layout
		const halfExtent = layout ? Math.max(layout.width, layout.depth) * 0.66 : 20
		const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2)
		const distance = halfExtent / Math.tan(halfFov) / Math.min(1, aspect)

		this.renderer.setSize(width, height, false)
		this.camera.aspect = aspect
		/* Nhìn từ trên xuống, hơi chếch về phía người chơi như khi cầm board thật. */
		this.camera.position.set(0, distance * 0.93, distance * 0.36)
		this.camera.lookAt(0, -1, 0)
		this.camera.updateProjectionMatrix()
	}

	private readonly handleKeyDown = (event: KeyboardEvent): void => {
		if (!(event.code in KEY_DIRECTIONS) || isEditableTarget(event.target)) return

		event.preventDefault()
		this.pressedKeys.add(event.code)
	}

	private readonly handleKeyUp = (event: KeyboardEvent): void => {
		this.pressedKeys.delete(event.code)
	}

	private readonly handleBlur = (): void => {
		this.pressedKeys.clear()
		this.pointerOrigin = undefined
	}

	private readonly handlePointerDown = (event: PointerEvent): void => {
		if (this.pointerOrigin) return

		this.renderer.domElement.setPointerCapture(event.pointerId)
		this.pointerOrigin = { id: event.pointerId, x: event.clientX, y: event.clientY }
		this.pointerInput = { right: 0, forward: 0 }
	}

	private readonly handlePointerMove = (event: PointerEvent): void => {
		if (!this.pointerOrigin || event.pointerId !== this.pointerOrigin.id) return

		this.pointerInput = {
			right: (event.clientX - this.pointerOrigin.x) / POINTER_FULL_TILT_PIXELS,
			forward: (this.pointerOrigin.y - event.clientY) / POINTER_FULL_TILT_PIXELS
		}
	}

	private readonly handlePointerUp = (event: PointerEvent): void => {
		if (event.pointerId !== this.pointerOrigin?.id) return

		this.pointerOrigin = undefined
		this.pointerInput = { right: 0, forward: 0 }
	}

	/**
	 * Điện thoại cầm dọc: gamma = nghiêng trái/phải, beta = nghiêng trước/sau.
	 * Lấy tư thế đầu tiên làm "mặt phẳng" để người chơi cầm máy theo góc thoải mái.
	 */
	private readonly handleDeviceOrientation = (event: DeviceOrientationEvent): void => {
		if (event.beta === null || event.gamma === null) return

		this.deviceNeutral ??= { beta: event.beta, gamma: event.gamma }
		this.deviceInput = {
			right: (event.gamma - this.deviceNeutral.gamma) / DEVICE_FULL_TILT_DEGREES,
			forward: (this.deviceNeutral.beta - event.beta) / DEVICE_FULL_TILT_DEGREES
		}
	}
}

function isEditableTarget(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	)
}

function createMaterials() {
	return {
		floor: new THREE.MeshStandardMaterial({ color: 0xe6cfa3, roughness: 0.72 }),
		wall: new THREE.MeshStandardMaterial({ color: 0xa8744a, roughness: 0.6 }),
		box: new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.65 }),
		boxInside: new THREE.MeshStandardMaterial({ color: 0x1b1410, roughness: 0.95 }),
		guide: new THREE.MeshStandardMaterial({
			color: 0x1d1d1d,
			roughness: 0.9,
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -2
		}),
		goalRing: new THREE.MeshStandardMaterial({
			color: 0x2f9e44,
			roughness: 0.6,
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -2
		}),
		trapRing: new THREE.MeshStandardMaterial({
			color: 0x7a1f1f,
			roughness: 0.6,
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -2
		}),
		start: new THREE.MeshStandardMaterial({
			color: 0x1c7ed6,
			roughness: 0.6,
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -2
		}),
		ball: new THREE.MeshStandardMaterial({ color: 0xe9ecef, metalness: 1, roughness: 0.12 })
	}
}

type LabyrinthMaterials = ReturnType<typeof createMaterials>

/** Mọi thứ gắn với board nghiêng: sàn, tường, vạch chỉ dẫn, đánh dấu lỗ. */
function buildBoardContent(
	layout: LabyrinthLayout,
	materials: LabyrinthMaterials,
	disposables: Array<{ dispose(): void }>
): THREE.Group {
	const group = new THREE.Group()
	const paintY = 0.002

	const floorGeometry = createFloorGeometry(layout)
	const floor = new THREE.Mesh(floorGeometry, materials.floor)
	floor.receiveShadow = true
	floor.castShadow = true
	disposables.push(floorGeometry)
	group.add(floor)

	const wallGeometry = new THREE.BoxGeometry(1, 1, 1)
	const walls = new THREE.InstancedMesh(wallGeometry, materials.wall, layout.walls.length)
	const matrix = new THREE.Matrix4()
	const identity = new THREE.Quaternion()

	layout.walls.forEach((wall, index) => {
		matrix.compose(
			new THREE.Vector3(wall.center.x, wall.center.y, wall.center.z),
			identity,
			new THREE.Vector3(wall.size.x, wall.size.y, wall.size.z)
		)
		walls.setMatrixAt(index, matrix)
	})
	walls.castShadow = true
	walls.receiveShadow = true
	disposables.push(wallGeometry, walls)
	group.add(walls)

	const guideGeometry = createGuideLineGeometry(layout)
	if (guideGeometry) {
		const guide = new THREE.Mesh(guideGeometry, materials.guide)
		guide.position.y = paintY
		guide.receiveShadow = true
		disposables.push(guideGeometry)
		group.add(guide)
	}

	for (const hole of layout.holes) {
		const ringGeometry = new THREE.RingGeometry(hole.radius, hole.radius + 0.18, 40)
		ringGeometry.rotateX(-Math.PI / 2)
		const ring = new THREE.Mesh(
			ringGeometry,
			hole.kind === 'goal' ? materials.goalRing : materials.trapRing
		)
		ring.position.set(hole.position.x, paintY, hole.position.z)
		ring.receiveShadow = true
		disposables.push(ringGeometry)
		group.add(ring)
	}

	const startGeometry = new THREE.RingGeometry(
		layout.ballRadius * 0.9,
		layout.ballRadius * 1.15,
		32
	)
	startGeometry.rotateX(-Math.PI / 2)
	const startMarker = new THREE.Mesh(startGeometry, materials.start)
	startMarker.position.set(layout.start.x, paintY, layout.start.z)
	disposables.push(startGeometry)
	group.add(startMarker)

	return group
}

/**
 * Vạch đen chỉ đường như trên board Labyrinth thật:
 * các dải phẳng nối tâm cell + chấm tròn ở khớp nối.
 * Dừng trước mép lỗ đích để không vẽ đè lên khoảng trống.
 */
function createGuideLineGeometry(layout: LabyrinthLayout): THREE.BufferGeometry | undefined {
	const goal = layout.holes.find((hole) => hole.kind === 'goal')
	const points = trimPathEnd(layout.guidePath, (goal?.radius ?? 0) + 0.25)
	if (points.length < 2) return undefined

	const parts: THREE.BufferGeometry[] = []

	for (let index = 0; index < points.length; index += 1) {
		const point = points[index]
		const joint = new THREE.CircleGeometry(GUIDE_LINE_WIDTH / 2, 16)
		joint.rotateX(-Math.PI / 2)
		joint.translate(point.x, 0, point.z)
		parts.push(joint)

		const next = points[index + 1]
		if (!next) continue

		const length = Math.hypot(next.x - point.x, next.z - point.z)
		const segment = new THREE.PlaneGeometry(length, GUIDE_LINE_WIDTH)
		segment.rotateX(-Math.PI / 2)
		segment.rotateY(-Math.atan2(next.z - point.z, next.x - point.x))
		segment.translate((point.x + next.x) / 2, 0, (point.z + next.z) / 2)
		parts.push(segment)
	}

	const merged = mergeGeometries(parts)
	for (const part of parts) part.dispose()

	return merged ?? undefined
}

function trimPathEnd(points: readonly BoardPoint[], distance: number): BoardPoint[] {
	if (points.length < 2) return [...points]

	const last = points[points.length - 1]
	const previous = points[points.length - 2]
	const length = Math.hypot(last.x - previous.x, last.z - previous.z)
	if (length <= distance) return points.slice(0, -1)

	const t = (length - distance) / length

	return [
		...points.slice(0, -1),
		{ x: previous.x + (last.x - previous.x) * t, z: previous.z + (last.z - previous.z) * t }
	]
}

/**
 * Hộp gỗ cố định bên ngoài (không nghiêng theo board).
 * Thành hộp đặt đủ thấp để góc board nghiêng tối đa không xuyên qua.
 */
function buildOuterBox(
	layout: LabyrinthLayout,
	maxTiltDegrees: number,
	materials: LabyrinthMaterials,
	disposables: Array<{ dispose(): void }>
): THREE.Group {
	const group = new THREE.Group()
	const gap = 1.2
	const wall = 1.4
	const innerHalfWidth = layout.width / 2 + gap
	const innerHalfDepth = layout.depth / 2 + gap
	const maxTilt = THREE.MathUtils.degToRad(Math.max(maxTiltDegrees, 8))
	const cornerDip = (layout.width / 2) * Math.sin(maxTilt) + (layout.depth / 2) * Math.sin(maxTilt)
	const rimY = -(LABYRINTH_FLOOR_THICKNESS + cornerDip + 0.6)
	const bottomY = rimY - 6

	const insideGeometry = new THREE.PlaneGeometry(innerHalfWidth * 2, innerHalfDepth * 2)
	insideGeometry.rotateX(-Math.PI / 2)
	const inside = new THREE.Mesh(insideGeometry, materials.boxInside)
	inside.position.y = bottomY
	inside.receiveShadow = true
	disposables.push(insideGeometry)
	group.add(inside)

	const height = rimY - bottomY
	const sides: Array<[number, number, number, number]> = [
		[0, -(innerHalfDepth + wall / 2), innerHalfWidth * 2 + wall * 2, wall],
		[0, innerHalfDepth + wall / 2, innerHalfWidth * 2 + wall * 2, wall],
		[-(innerHalfWidth + wall / 2), 0, wall, innerHalfDepth * 2],
		[innerHalfWidth + wall / 2, 0, wall, innerHalfDepth * 2]
	]

	for (const [x, z, sizeX, sizeZ] of sides) {
		const geometry = new THREE.BoxGeometry(sizeX, height, sizeZ)
		const side = new THREE.Mesh(geometry, materials.box)
		side.position.set(x, bottomY + height / 2, z)
		side.castShadow = true
		side.receiveShadow = true
		disposables.push(geometry)
		group.add(side)
	}

	return group
}
