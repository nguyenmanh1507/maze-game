/**
 * Góc nghiêng của board, tính bằng radian.
 *
 * - `x`: quay quanh trục X. Âm = mép xa (Z âm) hạ xuống → bi lăn ra xa.
 * - `z`: quay quanh trục Z. Âm = mép phải (X dương) hạ xuống → bi lăn sang phải.
 *
 * Cùng quy ước với `Object3D.rotation.set(x, 0, z)` của three.js (thứ tự XYZ).
 */
export interface BoardTilt {
	x: number
	z: number
}

/**
 * Hướng điều khiển đã chuẩn hoá: `right` ∈ [-1, 1], `forward` ∈ [-1, 1].
 * forward = 1 nghĩa là muốn bi lăn ra xa người chơi.
 */
export interface TiltInput {
	right: number
	forward: number
}

export interface TiltResponse {
	/** Hệ số bám theo mục tiêu (1/giây). Lớn hơn → board phản ứng nhanh hơn. */
	response: number
	/** Tốc độ nghiêng tối đa (radian/giây), mô phỏng núm vặn có quán tính. */
	maxRate: number
}

export function clampTiltInput(input: TiltInput): TiltInput {
	const length = Math.hypot(input.right, input.forward)
	if (!Number.isFinite(length) || length === 0) return { right: 0, forward: 0 }
	if (length <= 1) return { right: input.right, forward: input.forward }

	return { right: input.right / length, forward: input.forward / length }
}

export function inputToTargetTilt(input: TiltInput, maxTilt: number): BoardTilt {
	const clamped = clampTiltInput(input)

	return { x: -clamped.forward * maxTilt, z: -clamped.right * maxTilt }
}

/**
 * Tiến góc nghiêng hiện tại về phía mục tiêu:
 * làm mượt kiểu hàm mũ rồi giới hạn tốc độ quay.
 */
export function stepTilt(
	current: BoardTilt,
	target: BoardTilt,
	deltaSeconds: number,
	settings: TiltResponse
): BoardTilt {
	const blend = 1 - Math.exp(-settings.response * deltaSeconds)
	let deltaX = (target.x - current.x) * blend
	let deltaZ = (target.z - current.z) * blend
	const maxStep = settings.maxRate * deltaSeconds
	const step = Math.hypot(deltaX, deltaZ)

	if (step > maxStep && step > 0) {
		deltaX *= maxStep / step
		deltaZ *= maxStep / step
	}

	return { x: current.x + deltaX, z: current.z + deltaZ }
}

/**
 * Trọng lực biểu diễn trong hệ toạ độ của board.
 *
 * Thay vì quay board trong physics world (board là kinematic), ta giữ board đứng yên
 * và quay vector trọng lực ngược lại: g_local = Rᵀ · (0, -g, 0) với R = Rx · Rz.
 * Ổn định hơn nhiều, và với góc nghiêng nhỏ thì cảm giác gần như không khác.
 */
export function tiltToLocalGravity(
	tilt: BoardTilt,
	gravity: number
): { x: number; y: number; z: number } {
	const cosX = Math.cos(tilt.x)
	const sinX = Math.sin(tilt.x)
	const cosZ = Math.cos(tilt.z)
	const sinZ = Math.sin(tilt.z)

	return {
		x: -gravity * cosX * sinZ,
		y: -gravity * cosX * cosZ,
		z: gravity * sinX
	}
}
