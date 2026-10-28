import { Result, Schema } from 'effect'
import { DeltaTimeSecs, MonotonicTimeSecs } from '@nerima-games/mc-kernel'
import {
  INITIAL_PLAYER_POSE,
  cameraPoseOf,
} from '@nerima-games/mc-sim'
import { describe, expect, it } from 'vitest'
import {
  FramesPerSecondSchema,
  GpuTimeMillisecondsSchema,
  type DebugOverlayModel,
  type DebugOverlaySnapshot,
} from '../src/domain/debug-overlay'
import { createDebugOverlayView } from '../src/application/debug-overlay-view'
import { fakeDocument, fakeElement, writeNames } from './fake-dom'

const emptySnapshot = (): DebugOverlaySnapshot => ({
  cameraPose: undefined,
  dimension: undefined,
  worldTime: undefined,
  frame: undefined,
  gpuTimingSupported: undefined,
  latestGpuTimeMs: undefined,
  qualityPreset: undefined,
})

const facing = (yawRadians: number, pitchRadians: number): NonNullable<DebugOverlayModel['facing']> => {
  const result = cameraPoseOf(
    { ...INITIAL_PLAYER_POSE, yawRadians, pitchRadians },
    MonotonicTimeSecs(0),
  )
  if (Result.isSuccess(result)) {
    return {
      yawRadians: result.success.yawRadians,
      pitchRadians: result.success.pitchRadians,
    }
  }
  throw new Error('expected camera pose to be valid')
}

const populatedModel: DebugOverlayModel = {
  fps: Schema.decodeUnknownSync(FramesPerSecondSchema)(0),
  coordinates: { worldX: 0, worldY: 64, worldZ: -0.5 },
  chunk: null,
  facing: facing(0, -0.25),
  dimension: 'overworld',
  biome: null,
  worldTime: { ticks: 0, dayLengthTicks: 24_000 },
  frameDeltaSecs: DeltaTimeSecs(0),
  gpuTimingSupported: false,
  latestGpuTimeMs: Schema.decodeUnknownSync(GpuTimeMillisecondsSchema)(0),
  qualityPreset: 'low',
}

describe('createDebugOverlayView', () => {
  it('mounts an accessible, initially hidden debug region', () => {
    const factory = fakeDocument()
    const parent = fakeElement(factory.createElement('main'))
    const view = createDebugOverlayView(factory, parent)
    const root = fakeElement(view.root)

    expect(parent.children).toHaveLength(1)
    expect(root.tagName).toBe('section')
    expect(root.attributes.get('data-mx-ui')).toBe('debug-overlay')
    expect(root.attributes.get('role')).toBe('region')
    expect(root.attributes.get('aria-label')).toBe('Debug overlay')
    expect(root.attributes.has('hidden')).toBe(true)
    expect(root.style.properties.get('white-space')).toBe('pre')
  })

  it('renders missing values as なし and retains zero and false', () => {
    const factory = fakeDocument()
    const parent = factory.createElement('main')
    const view = createDebugOverlayView(factory, parent)
    const root = fakeElement(view.root)

    view.update(emptySnapshot())

    expect(root.textContent).toBe(
      [
        'FPS: なし',
        'Coordinates: なし',
        'Chunk: なし',
        'Facing: なし',
        'Dimension: なし',
        'Biome: なし',
        'World time: なし',
        'Frame delta: なし',
        'GPU timing supported: なし',
        'GPU time: なし',
        'Quality: なし',
      ].join('\n'),
    )

    view.render(populatedModel)

    expect(root.textContent).toContain('FPS: 0')
    expect(root.textContent).toContain('Coordinates: 0, 64, -0.5')
    expect(root.textContent).toContain('Facing: yaw=0, pitch=-0.25')
    expect(root.textContent).toContain('Dimension: overworld')
    expect(root.textContent).toContain('World time: ticks=0, dayLengthTicks=24000')
    expect(root.textContent).toContain('Frame delta: 0')
    expect(root.textContent).toContain('GPU timing supported: false')
    expect(root.textContent).toContain('GPU time: 0')
    expect(root.textContent).toContain('Quality: low')
  })

  it('updates with a public production frame and skips unchanged text writes', () => {
    const factory = fakeDocument()
    const parent = factory.createElement('main')
    const view = createDebugOverlayView(factory, parent)
    const root = fakeElement(view.root)
    const frame: NonNullable<DebugOverlaySnapshot['frame']> = {
      deltaSecs: DeltaTimeSecs(0.25),
      cameraPosition: { worldX: -1, worldY: 0, worldZ: 3 },
    }
    const snapshot: DebugOverlaySnapshot = {
      ...emptySnapshot(),
      frame,
    }

    view.update(snapshot)
    expect(root.textContent).toContain('FPS: 4')
    expect(root.textContent).toContain('Coordinates: -1, 0, 3')
    expect(root.textContent).toContain('Frame delta: 0.25')

    const before = factory.mark()
    view.update(snapshot)
    expect(writeNames(factory.since(before))).toStrictEqual([])
  })
})
