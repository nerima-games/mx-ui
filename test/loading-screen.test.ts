import { Result } from 'effect'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  IDLE_LOADING_STATUS,
  LOADING_MINIMUM_VISIBLE_SECS,
  createLoadingStatus,
  loadingScreenView,
  loadingStatus,
  type LoadingStage,
  type LoadingStageProgress,
  type LoadingStatus,
} from '../src/domain/loading-screen'
import {
  LOADING_DETAIL,
  LOADING_KICKER,
  LOADING_LABEL,
  LOADING_STATES,
  createLoadingView,
} from '../src/application/loading-view'
import { PALETTE_PROPERTY, PALETTE_VAR } from '../src/application/palette-css'
import { translateUiMessage } from '../src/domain/ui-language'
import { fakeDocument, fakeElement, writeNames } from './fake-dom'

const mount = () => {
  const factory = fakeDocument()
  const parent = fakeElement(factory.createElement('div'))
  const view = createLoadingView(factory, parent)
  return { factory, parent, view, root: fakeElement(view.root) }
}

const status = (progress: LoadingStageProgress, atSecs = 0): LoadingStatus => {
  const result = createLoadingStatus(progress, atSecs)
  if (Result.isFailure(result)) {
    throw new Error(`Unexpected loading progress failure: ${result.failure['_tag']}`)
  }
  return result.success
}

const preparing = status({ kind: 'preparing', stage: 'generation', progress: 0.35 })
const ready = status({ kind: 'ready' })
const failed = (reason: string) => status({ kind: 'failed', reason })

describe('loading progress domain', () => {
  it('accepts both closed interval boundaries and rejects values outside it', () => {
    expect(Result.isSuccess(createLoadingStatus({ kind: 'preparing', stage: 'generation', progress: 0 }, 0))).toBe(true)
    expect(Result.isSuccess(createLoadingStatus({ kind: 'preparing', stage: 'reading', progress: 1 }, 0))).toBe(true)
    for (const value of [-Number.MIN_VALUE, -0.01, 1.01, 2, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = createLoadingStatus({ kind: 'preparing', stage: 'reading', progress: value }, 0)
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toEqual({ _tag: 'InvalidLoadingProgress', stage: 'reading', progress: value })
      }
    }
  })

  it('property: accepts exactly finite progress values in [0, 1]', () => {
    fc.assert(
      fc.property(fc.double(), (progress) => {
        const expectedValid = Number.isFinite(progress) && progress >= 0 && progress <= 1
        const result = createLoadingStatus({ kind: 'preparing', stage: 'render-preparation', progress }, 0)
        expect(Result.isSuccess(result)).toBe(expectedValid)
        if (!expectedValid && Result.isFailure(result)) {
          expect(result.failure['_tag']).toBe('InvalidLoadingProgress')
        }
      }),
    )
  })

  it('retains the minimum-visible floor while reporting stage and progress', () => {
    expect(LOADING_MINIMUM_VISIBLE_SECS).toBe(2.5)
    expect(loadingScreenView(ready, 0)).toEqual({
      kind: 'preparing',
      stage: 'render-preparation',
      progress: 1,
      held: true,
    })
    expect(loadingScreenView(ready, LOADING_MINIMUM_VISIBLE_SECS - 0.001)).toMatchObject({
      kind: 'preparing',
      held: true,
    })
    expect(loadingScreenView(ready, LOADING_MINIMUM_VISIBLE_SECS)).toBeUndefined()
    expect(loadingScreenView(preparing, 100)).toEqual({
      kind: 'preparing',
      stage: 'generation',
      progress: 0.35,
      held: false,
    })
    expect(loadingScreenView(failed('disk full'), 100)).toEqual({ kind: 'failed', reason: 'disk full' })
    expect(loadingScreenView(IDLE_LOADING_STATUS, 3)).toBeUndefined()
  })

  it('keeps existing indeterminate host calls usable as generation at zero', () => {
    expect(loadingScreenView(loadingStatus({ kind: 'preparing' }, 0), 5)).toEqual({
      kind: 'preparing',
      stage: 'generation',
      progress: 0,
      held: false,
    })
    expect(loadingStatus({ kind: 'ready' }, Number.NaN).startedAtSecs).toBe(0)
  })
})

describe('loading view projection', () => {
  it('declares both status colors on its root', () => {
    const { root } = mount()
    expect(root.style.properties.get(PALETTE_PROPERTY.statusAlert)).toBeDefined()
    expect(root.find('data-loading-state', 'preparing')?.find('data-mx-ui', 'loading-kicker')?.style.properties.get('color')).toBe(
      PALETTE_VAR.statusBusy,
    )
    expect(root.find('data-loading-state', 'failed')?.find('data-mx-ui', 'loading-kicker')?.style.properties.get('color')).toBe(
      PALETTE_VAR.statusAlert,
    )
  })

  it('shows each stage and a determinate accessible progress bar', () => {
    const { root, view } = mount()
    const stages: ReadonlyArray<LoadingStage> = ['generation', 'reading', 'render-preparation']
    const values = [0, 0.375, 1]
    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index]
      const progress = values[index]
      if (typeof stage === 'undefined' || typeof progress === 'undefined') {
        throw new Error('stage fixture is incomplete')
      }
      const projected = loadingScreenView(status({ kind: 'preparing', stage, progress }), 0)
      view.render(projected)
      const state = root.find('data-loading-state', 'preparing')
      expect(state?.find('data-mx-ui', 'loading-stage')?.textContent).toBe(translateUiMessage('en', `loading.stage.${stage}`))
      expect(state?.find('data-mx-ui', 'loading-progress')?.attributes.get('role')).toBe('progressbar')
      expect(state?.find('data-mx-ui', 'loading-progress')?.attributes.get('aria-valuenow')).toBe(String(progress * 100))
      expect(state?.find('data-mx-ui', 'loading-progress-fill')?.style.properties.get('width')).toBe(`${String(progress * 100)}%`)
      expect(state?.find('data-mx-ui', 'loading-progress-text')?.textContent).toContain(`${String(Math.round(progress * 100))}%`)
    }
  })

  it('shows one state at a time and hides a failure reason with its state', () => {
    const { root, view } = mount()
    view.render(loadingScreenView(preparing, 0))
    expect(root.attributes.get('aria-busy')).toBe('true')
    expect(root.find('data-loading-state', 'preparing')?.attributes.has('hidden')).toBe(false)
    expect(root.find('data-loading-state', 'failed')?.attributes.has('hidden')).toBe(true)

    view.render(loadingScreenView(failed('<script>safe text</script>'), 0))
    expect(root.attributes.get('aria-busy')).toBe('false')
    expect(root.find('data-mx-ui', 'loading-reason')?.textContent).toBe('<script>safe text</script>')
    expect(root.find('data-loading-state', 'preparing')?.attributes.has('hidden')).toBe(true)
    view.render(undefined)
    expect(root.attributes.has('hidden')).toBe(true)
    expect(LOADING_STATES.every((kind) => root.find('data-loading-state', kind)?.attributes.has('hidden'))).toBe(true)
  })

  it('preserves the minimum floor state as observable metadata', () => {
    const { root, view } = mount()
    view.render({ kind: 'preparing', stage: 'render-preparation', progress: 1, held: false })
    expect(root.attributes.has('data-loading-held')).toBe(false)
    view.render({ kind: 'preparing', stage: 'render-preparation', progress: 1, held: true })
    expect(root.attributes.get('data-loading-held')).toBe('')
  })

  it('does not mutate an unchanged progress view', () => {
    const { factory, view } = mount()
    const progressView = { kind: 'preparing', stage: 'reading', progress: 0.25, held: false } as const
    view.render(progressView)
    const before = factory.mark()
    view.render(progressView)
    expect(writeNames(factory.since(before))).toEqual([])
  })

  it('keeps the existing labels and adds no event handlers', () => {
    const { root, view } = mount()
    view.render({ kind: 'failed', reason: 'broken' })
    expect(root.find('data-loading-state', 'preparing')?.find('data-mx-ui', 'loading-title')?.textContent).toBe(LOADING_LABEL.preparing)
    expect(root.find('data-loading-state', 'preparing')?.find('data-mx-ui', 'loading-kicker')?.textContent).toBe(LOADING_KICKER.preparing)
    expect(root.find('data-loading-state', 'failed')?.find('data-mx-ui', 'loading-detail')?.textContent).toBe(LOADING_DETAIL.failed)
    expect(root.listenersInTree()).toEqual([])
  })
})
