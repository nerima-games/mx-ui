import {
  type DebugOverlayModel,
  type DebugOverlaySnapshot,
  debugOverlayModel,
} from '../domain/debug-overlay.js'
import type { DomElement, DomElementFactory } from './dom-surface.js'
import {
  type UiLanguage,
  type UiMessageKey,
  type UiMessageText,
  UiMessageTextSchema,
  translateUiMessage,
} from '../domain/ui-language.js'
import { setLocalizedAttribute, writeLocalizedTextUsing } from './ui-localization.js'
import { Schema } from 'effect'
import { textCell } from './dom-write.js'

export type DebugOverlayView = Readonly<{
  root: DomElement
  render: (model: DebugOverlayModel) => void
  update: (snapshot: DebugOverlaySnapshot) => void
}>

const optionalNumber = (language: UiLanguage, value: number | null): string => {
  if (value === null) {
    return translateUiMessage(language, 'debug.none')
  }

  return String(value)
}

const optionalBoolean = (language: UiLanguage, value: boolean | null): string => {
  if (value === null) {
    return translateUiMessage(language, 'debug.none')
  }
  if (value) {
    return translateUiMessage(language, 'debug.true')
  }
  return translateUiMessage(language, 'debug.false')
}

const coordinateLine = (language: UiLanguage, model: DebugOverlayModel): string => {
  if (model.coordinates === null) {
    return translateUiMessage(language, 'debug.none')
  }

  return `${String(model.coordinates.worldX)}, ${String(model.coordinates.worldY)}, ${String(model.coordinates.worldZ)}`
}

const facingLine = (language: UiLanguage, model: DebugOverlayModel): string => {
  if (model.facing === null) {
    return translateUiMessage(language, 'debug.none')
  }

  return translateUiMessage(language, 'debug.yaw-pitch', {
    pitch: model.facing.pitchRadians,
    yaw: model.facing.yawRadians,
  })
}

const worldTimeLine = (language: UiLanguage, model: DebugOverlayModel): string => {
  if (model.worldTime === null) {
    return translateUiMessage(language, 'debug.none')
  }

  return translateUiMessage(language, 'debug.ticks', {
    dayLengthTicks: model.worldTime.dayLengthTicks,
    ticks: model.worldTime.ticks,
  })
}

const LAST_SEGMENT_INDEX = -1

const dimensionMessageKey = (dimension: string): UiMessageKey | null => {
  const id = dimension.split(':').at(LAST_SEGMENT_INDEX)?.toLowerCase()
  if (id === 'overworld') {
    return 'debug.dimension.overworld'
  }
  if (id === 'nether' || id === 'the_nether') {
    return 'debug.dimension.nether'
  }
  if (id === 'end' || id === 'the_end') {
    return 'debug.dimension.end'
  }
  return null
}

const qualityMessageKey = (quality: string): UiMessageKey | null => {
  if (quality === 'low') {
    return 'settings.choice.graphics.low'
  }
  if (quality === 'medium') {
    return 'settings.choice.graphics.medium'
  }
  if (quality === 'high') {
    return 'settings.choice.graphics.high'
  }
  if (quality === 'ultra') {
    return 'settings.choice.graphics.ultra'
  }
  return null
}

const optionalDimension = (language: UiLanguage, value: string | null): string => {
  if (value === null) {
    return translateUiMessage(language, 'debug.none')
  }
  const key = dimensionMessageKey(value)
  if (key === null) {
    return value
  }
  return translateUiMessage(language, key)
}

const optionalQuality = (language: UiLanguage, value: string | null): string => {
  if (value === null) {
    return translateUiMessage(language, 'debug.none')
  }
  const key = qualityMessageKey(value)
  if (key === null) {
    return value
  }
  return translateUiMessage(language, key)
}

const decodeUiMessageText = Schema.decodeUnknownSync(UiMessageTextSchema)

const debugOverlayText = (language: UiLanguage, model: DebugOverlayModel): UiMessageText =>
  decodeUiMessageText([
    translateUiMessage(language, 'debug.fps', { fps: optionalNumber(language, model.fps) }),
    translateUiMessage(language, 'debug.coordinates', { coordinates: coordinateLine(language, model) }),
    translateUiMessage(language, 'debug.chunk', { chunk: translateUiMessage(language, 'debug.none') }),
    translateUiMessage(language, 'debug.facing', { facing: facingLine(language, model) }),
    translateUiMessage(language, 'debug.dimension', { dimension: optionalDimension(language, model.dimension) }),
    translateUiMessage(language, 'debug.biome', { biome: translateUiMessage(language, 'debug.none') }),
    translateUiMessage(language, 'debug.world-time', { worldTime: worldTimeLine(language, model) }),
    translateUiMessage(language, 'debug.frame-delta', { seconds: optionalNumber(language, model.frameDeltaSecs) }),
    translateUiMessage(language, 'debug.gpu-timing-supported', { supported: optionalBoolean(language, model.gpuTimingSupported) }),
    translateUiMessage(language, 'debug.gpu-time', { milliseconds: optionalNumber(language, model.latestGpuTimeMs) }),
    translateUiMessage(language, 'debug.quality', { quality: optionalQuality(language, model.qualityPreset) }),
  ].join('\n'))

export const createDebugOverlayView = (
  factory: DomElementFactory,
  parent: DomElement,
): DebugOverlayView => {
  const root = factory.createElement('section')
  root.setAttribute('data-mx-ui', 'debug-overlay')
  root.setAttribute('role', 'region')
  setLocalizedAttribute(root, 'aria-label', 'debug.overlay')
  root.setAttribute('hidden', '')
  root.style.setProperty('white-space', 'pre')
  parent.appendChild(root)

  const cell = textCell(root)
  const render = (model: DebugOverlayModel): void =>
    writeLocalizedTextUsing(cell, (language) => debugOverlayText(language, model))

  return {
    render,
    root,
    update: (snapshot) => render(debugOverlayModel(snapshot)),
  }
}
