import {
  FPS_SAMPLE_WINDOW_SECS,
  advanceFpsCounter,
  emptyFpsCounter,
} from '../src/domain/fps-counter'
import { describe, expect, it } from 'vitest'

/* oxlint-disable no-magic-numbers */

describe('FPS counter', () => {
  it('starts with no published sample', () => {
    expect(emptyFpsCounter).toStrictEqual({ elapsedSecs: 0, fps: 0, frameCount: 0 })
  })

  it('accumulates frames until the sample window is complete', () => {
    const first = advanceFpsCounter(emptyFpsCounter, 0.25)
    const second = advanceFpsCounter(first, 0.25)

    expect(second).toStrictEqual({ elapsedSecs: 0.5, fps: 0, frameCount: 2 })
  })

  it('publishes the average FPS at the exact window boundary', () => {
    const before = advanceFpsCounter(emptyFpsCounter, 0.5)
    const complete = advanceFpsCounter(before, 0.5)

    expect(complete).toStrictEqual({ elapsedSecs: 0, fps: 2, frameCount: 0 })
  })

  it('uses actual elapsed time when a frame crosses the window boundary', () => {
    const before = advanceFpsCounter(emptyFpsCounter, 0.75)
    const complete = advanceFpsCounter(before, 0.5)

    expect(complete.fps).toBeCloseTo(1.6)
  })

  it('keeps the previous published FPS while collecting the next sample', () => {
    const published = advanceFpsCounter(emptyFpsCounter, 1)
    const collecting = advanceFpsCounter(published, 0.25)

    expect(collecting).toStrictEqual({ elapsedSecs: 0.25, fps: 1, frameCount: 1 })
  })

  it('supports a deterministic custom sample window', () => {
    const complete = advanceFpsCounter(emptyFpsCounter, 0.5, 0.5)

    expect(complete.fps).toBe(2)
  })

  it.each([0, -0.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'does not change state for an unusable delta: %s',
    (dt) => {
      const counter = { elapsedSecs: 0.25, fps: 60, frameCount: 15 }

      expect(advanceFpsCounter(counter, dt)).toBe(counter)
    },
  )

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'does not change state for an unusable sample window: %s',
    (window) => {
      const counter = { elapsedSecs: 0.25, fps: 60, frameCount: 15 }

      expect(advanceFpsCounter(counter, 0.25, window)).toBe(counter)
    },
  )

  it('uses one second as the production sample window', () => {
    expect(FPS_SAMPLE_WINDOW_SECS).toBe(1)
  })
})
