import {
  type DebugOverlayModel,
  type DebugOverlaySnapshot,
  debugOverlayModel,
} from '../domain/debug-overlay.js'
import type { DomElement, DomElementFactory } from './dom-surface.js'
import { textCell, writeText } from './dom-write.js'

export type DebugOverlayView = Readonly<{
  root: DomElement
  render: (model: DebugOverlayModel) => void
  update: (snapshot: DebugOverlaySnapshot) => void
}>

const optionalNumber = (value: number | null): string => {
  if (value === null) {
    return 'なし'
  }

  return String(value)
}

const optionalBoolean = (value: boolean | null): string => {
  if (value === null) {
    return 'なし'
  }

  return String(value)
}

const optionalText = (value: string | null): string => {
  if (value === null) {
    return 'なし'
  }

  return value
}

const coordinateLine = (model: DebugOverlayModel): string => {
  if (model.coordinates === null) {
    return 'なし'
  }

  return `${String(model.coordinates.worldX)}, ${String(model.coordinates.worldY)}, ${String(model.coordinates.worldZ)}`
}

const facingLine = (model: DebugOverlayModel): string => {
  if (model.facing === null) {
    return 'なし'
  }

  return `yaw=${String(model.facing.yawRadians)}, pitch=${String(model.facing.pitchRadians)}`
}

const worldTimeLine = (model: DebugOverlayModel): string => {
  if (model.worldTime === null) {
    return 'なし'
  }

  return `ticks=${String(model.worldTime.ticks)}, dayLengthTicks=${String(model.worldTime.dayLengthTicks)}`
}

const debugOverlayText = (model: DebugOverlayModel): string =>
  [
    `FPS: ${optionalNumber(model.fps)}`,
    `Coordinates: ${coordinateLine(model)}`,
    'Chunk: なし',
    `Facing: ${facingLine(model)}`,
    `Dimension: ${optionalText(model.dimension)}`,
    'Biome: なし',
    `World time: ${worldTimeLine(model)}`,
    `Frame delta: ${optionalNumber(model.frameDeltaSecs)}`,
    `GPU timing supported: ${optionalBoolean(model.gpuTimingSupported)}`,
    `GPU time: ${optionalNumber(model.latestGpuTimeMs)}`,
    `Quality: ${optionalText(model.qualityPreset)}`,
  ].join('\n')

export const createDebugOverlayView = (
  factory: DomElementFactory,
  parent: DomElement,
): DebugOverlayView => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'debug-overlay')
  root.setAttribute('role', 'region')
  root.setAttribute('aria-label', 'Debug overlay')
  root.setAttribute('hidden', '')
  root.style.setProperty('white-space', 'pre')
  parent.appendChild(root)

  const cell = textCell(root)
  const render = (model: DebugOverlayModel): void => writeText(cell, debugOverlayText(model))

  return {
    render,
    root,
    update: (snapshot) => render(debugOverlayModel(snapshot)),
  }
}
