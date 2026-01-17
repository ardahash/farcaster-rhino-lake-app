export type PathPoint = {
  x: number
  y: number
}

export type PathData = {
  points: PathPoint[]
  segLen: number[]
  cumLen: number[]
  totalLength: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const dist = (a: PathPoint, b: PathPoint) => Math.hypot(b.x - a.x, b.y - a.y)

const normalize = (value: PathPoint) => {
  const length = Math.hypot(value.x, value.y)
  if (!length) return { x: 1, y: 0 }
  return { x: value.x / length, y: value.y / length }
}

export const buildPathData = (points: readonly PathPoint[]): PathData => {
  const normalized = points.map((point) => ({ x: point.x, y: point.y }))
  if (normalized.length < 2) {
    return {
      points: normalized,
      segLen: [],
      cumLen: [0],
      totalLength: 0,
    }
  }

  const segLen: number[] = []
  const cumLen: number[] = [0]
  for (let i = 0; i < normalized.length - 1; i += 1) {
    const length = dist(normalized[i], normalized[i + 1])
    segLen.push(length)
    cumLen.push(cumLen[i] + length)
  }

  return {
    points: normalized,
    segLen,
    cumLen,
    totalLength: cumLen[cumLen.length - 1] ?? 0,
  }
}

export const sampleAtS = (path: PathData, s: number) => {
  const total = path.totalLength
  if (!total || path.points.length < 2) {
    return {
      pos: path.points[0] ?? { x: 0, y: 0 },
      tangent: { x: 1, y: 0 },
    }
  }

  const clamped = clamp(s, 0, total)
  const cumLen = path.cumLen

  let low = 0
  let high = cumLen.length - 1
  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2)
    if (cumLen[mid] <= clamped) {
      low = mid
    } else {
      high = mid
    }
  }

  const index = Math.min(low, path.segLen.length - 1)
  const segLength = path.segLen[index] ?? 0
  const p0 = path.points[index]
  const p1 = path.points[index + 1] ?? p0

  if (!segLength) {
    return {
      pos: { x: p0.x, y: p0.y },
      tangent: normalize({ x: p1.x - p0.x, y: p1.y - p0.y }),
    }
  }

  const t = clamp((clamped - cumLen[index]) / segLength, 0, 1)
  const pos = {
    x: p0.x + (p1.x - p0.x) * t,
    y: p0.y + (p1.y - p0.y) * t,
  }
  const tangent = normalize({ x: p1.x - p0.x, y: p1.y - p0.y })

  return { pos, tangent }
}

export const lerpAngle = (current: number, target: number, factor: number) => {
  const delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI
  return current + delta * factor
}

export const smoothAngle = (current: number, target: number, dt: number, k = 10) => {
  const factor = 1 - Math.exp(-k * dt)
  return lerpAngle(current, target, factor)
}
