/**
 * The crosshair — the row whose destination was doubted twice and is mx-ui's.
 *
 * ---------------------------------------------------------------------------
 * What was ported
 * ---------------------------------------------------------------------------
 *
 * `<reference-impl>/e2e/gameplay/block-interaction.e2e.ts` 「crosshair is visible
 * after game loads」 (#15) and its duplicate in `e2e/ui/hud.e2e.ts` 「#crosshair is
 * visible after game loads」. Both boot a game, wait for a frame counter, then
 * assert the element is attached and that its inline `display` is not `'none'`.
 *
 * **That is a weak pair of assertions and it is worth saying why before
 * replacing them.** 「attached」 was all Playwright could cheaply ask, because the
 * reference appends the reticle to `document.body` on `show()` and REMOVES it on
 * `hide()`, so presence in the document was the visibility model. mx-ui has no
 * `removeChild` (`application/dom-surface.ts`), so the tree built at mount is the
 * tree that exists forever and 「visible」 is a `hidden` attribute — which means
 * the interesting question, the one the reference could not ask without driving a
 * whole session, is **when it is NOT drawn**.
 *
 * The half that did not come is centring. `hud.e2e.ts:61-62` measures a bounding
 * box against the viewport's midpoint, and that is layout;
 * `docs/e2e-triage.md` keeps it in mc-compose with the rest of
 * `HUD remains usable at ${width}px`.
 *
 * Plain `it`, not `it.effect`, per DN-UI-2 and `docs/testing.md` §3.
 */
import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { Result } from 'effect'
import {
  CROSSHAIR_PULSE_SECS,
  crosshairViewModel as crosshairViewModelResult,
  IDLE_CROSSHAIR_STATUS,
  type CrosshairStatus,
  type CrosshairViewModel,
} from '../src/domain/crosshair'
import { openScreen, type ScreenId } from '../src/domain/modal-stack'
import {
  contrastRatio,
  GUARDED_TOKENS,
  INK,
  surveyPalette,
  UI_CONTRAST_MIN,
  type Rgb,
} from '../src/domain/palette'
import {
  CROSSHAIR_ARM_HIT_WEIGHT,
  CROSSHAIR_ARM_WEIGHT,
  CROSSHAIR_BREAK_PROGRESS_LABEL,
  CROSSHAIR_HALO_WIDTH,
  CROSSHAIR_PULSE_SCALE,
  createCrosshairView,
} from '../src/application/crosshair-view'
import { PALETTE_PROPERTY, PALETTE_VAR } from '../src/application/palette-css'
import { fakeDocument, fakeElement, writeNames, type FakeElement } from './fake-dom'

const mount = (motion: 'full' | 'reduced' = 'full') => {
  const factory = fakeDocument()
  const parent = fakeElement(factory.createElement('div'))
  const view = createCrosshairView(factory, parent, motion)
  return { factory, parent, view, root: fakeElement(view.root) }
}

const aiming: CrosshairStatus = IDLE_CROSSHAIR_STATUS
const hitAt = (secs: number): CrosshairStatus => ({ modals: [], lastHitAtSecs: secs })
const crosshairViewModel = (
  status: CrosshairStatus,
  nowSecs: number,
): CrosshairViewModel | undefined => {
  const result = crosshairViewModelResult(status, nowSecs)
  expect(Result.isFailure(result)).toBe(false)
  if (Result.isFailure(result)) {
    return undefined
  }
  return result.success
}

const arms = (root: FakeElement): ReadonlyArray<FakeElement> =>
  root.findAll('data-mx-ui', 'crosshair-arm')

const progress = (root: FakeElement): FakeElement | undefined =>
  root.find('data-mx-ui', 'crosshair-progress')

const progressFill = (root: FakeElement): FakeElement | undefined =>
  root.find('data-mx-ui', 'crosshair-progress-fill')

/**
 * An arm's THICKNESS, which is a different axis per arm.
 *
 * The vertical arm spans `height: 100%` and is thickened by `width`; the
 * horizontal one is the transpose. Reading 「width, or else height」 would silently
 * return the 100% span for one of the two and compare it against a weight.
 */
const thicknessOf = (root: FakeElement): ReadonlyArray<string | undefined> =>
  arms(root).map((arm) =>
    arm.attributes.get('data-crosshair-arm') === 'vertical'
      ? arm.style.properties.get('width')
      : arm.style.properties.get('height'),
  )

describe('when the crosshair is drawn, and when it is not', () => {
  it('returns a typed failure for a null model without clearing the current reticle', () => {
    const { root, view } = mount()
    const model = crosshairViewModel(aiming, 0)
    expect(model).toBeDefined()
    if (typeof model === 'undefined') {
      return
    }
    view.render(model)

    const omittedResult = view.render(undefined)
    expect(Result.isSuccess(omittedResult)).toBe(true)
    expect(root.attributes.has('hidden')).toBe(true)
    view.render(model)

    const result = Reflect.apply(view.render, view, [null])

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toStrictEqual({ _tag: 'InvalidCrosshairViewInput', field: 'model' })
    }
    expect(root.attributes.has('hidden')).toBe(false)
  })

  it('REGRESSION: is built at mount and shown once the player is aiming', () => {
    // The reference asked 「attached」 because attachment WAS its visibility
    // model — `show()` appends to `document.body`, `hide()` removes. Here the
    // element always exists and `hidden` carries the state, so both halves are
    // separable and both are asked.
    const { parent, root, view } = mount()

    expect(parent.children.map((child) => child.attributes.get('data-mx-ui'))).toStrictEqual([
      'crosshair',
    ])
    // Before anybody says the player is aiming, nothing is drawn — a reticle on
    // the title screen is the reference's `visibleRef` starting wrong.
    expect(root.attributes.has('hidden')).toBe(true)

    view.render(crosshairViewModel(aiming, 0))
    expect(root.attributes.has('hidden')).toBe(false)
    expect(arms(root)).toHaveLength(2)
  })

  it('REGRESSION: ANY open screen takes it down, including one nobody has written', () => {
    // The reference kept a `visibleRef` inside the renderer and toggled it from
    // the session bootstrap, so 「which situations hide the crosshair」 was a list
    // of call sites. Here it is `pointerLockReleased`, which is already the
    // answer to 「is the pointer gone」 — and aiming without a pointer lock is
    // aiming at nothing.
    //
    // So this holds for every member of `ScreenId`, including `achievements` and
    // `statistics`, which have no renderer at all. A list of call sites could not
    // have covered those.
    const everyScreen: ReadonlyArray<ScreenId> = [
      'pause',
      'settings',
      'inventory',
      'crafting',
      'chat',
      'achievements',
      'statistics',
    ]
    for (const screen of everyScreen) {
      const covered = { modals: openScreen([], screen), lastHitAtSecs: undefined }
      expect(crosshairViewModel(covered, 0), screen).toBeUndefined()
    }
    expect(crosshairViewModel(aiming, 0)).toStrictEqual({
      hit: false,
      breakProgress: undefined,
    })
  })

  it('hides the element rather than removing it, because the surface has no removeChild', () => {
    const { root, view } = mount()
    view.render(crosshairViewModel(aiming, 0))
    view.render(crosshairViewModel({ modals: ['pause'], lastHitAtSecs: undefined }, 0))

    expect(root.attributes.has('hidden')).toBe(true)
    // Still there. `application/hud-view.ts` explains why that matters: the tree
    // built at mount is the tree that exists forever, which is what lets every
    // cell hold a permanent element reference.
    expect(arms(root)).toHaveLength(2)
  })
})

describe('block-breaking progress', () => {
  it('keeps the progress field optional for existing object literals', () => {
    const legacyModel: CrosshairViewModel = { hit: false }

    expect(legacyModel.breakProgress).toBeUndefined()
  })

  it('normalises finite progress and returns typed failures for invalid progress', () => {
    const model = (breakProgress: number): number | undefined =>
      crosshairViewModel({ ...aiming, breakProgress }, 0)?.breakProgress

    expect(model(-0.25)).toBe(0)
    expect(model(0)).toBe(0)
    expect(model(0.375)).toBe(0.375)
    expect(model(1)).toBe(1)
    expect(model(1.25)).toBe(1)
    for (const breakProgress of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = crosshairViewModelResult({ ...aiming, breakProgress }, 0)
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toStrictEqual({ _tag: 'InvalidCrosshairViewModelInput', field: 'breakProgress' })
      }
    }
  })

  it('returns a typed failure for an explicit null progress value', () => {
    const status: CrosshairStatus = { ...aiming }
    expect(Reflect.set(status, 'breakProgress', null)).toBe(true)
    const result = crosshairViewModelResult(status, 0)

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toStrictEqual({ _tag: 'InvalidCrosshairViewModelInput', field: 'breakProgress' })
    }
  })

  it.each([null, 7])('returns a typed failure for an invalid status container %s', (status) => {
    const result = Reflect.apply(crosshairViewModelResult, undefined, [status, 0])

    expect(result).toStrictEqual(Result.fail({ _tag: 'InvalidCrosshairViewModelInput', field: 'status' }))
  })

  it('returns typed failures or a finite view model for arbitrary progress values', () => {
    fc.assert(
      fc.property(fc.anything(), (breakProgress) => {
        const status: CrosshairStatus = { ...aiming }
        expect(Reflect.set(status, 'breakProgress', breakProgress)).toBe(true)
        const result = crosshairViewModelResult(status, 0)
        if (typeof breakProgress === 'undefined') {
          expect(Result.isSuccess(result)).toBe(true)
          if (Result.isSuccess(result)) {
            expect(result.success?.breakProgress).toBeUndefined()
          }
          return
        }
        if (typeof breakProgress === 'number' && Number.isFinite(breakProgress)) {
          expect(Result.isSuccess(result)).toBe(true)
          if (Result.isSuccess(result)) {
            expect(result.success?.breakProgress).toBe(Math.min(1, Math.max(0, breakProgress)))
          }
          return
        }
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toStrictEqual({ _tag: 'InvalidCrosshairViewModelInput', field: 'breakProgress' })
        }
      }),
      { numRuns: 100 },
    )
  })

  it('distinguishes an active empty bar from no active break', () => {
    const { root, view } = mount()
    const track = progress(root)
    const fill = progressFill(root)

    expect(track?.attributes.has('hidden')).toBe(true)
    expect(track?.attributes.get('role')).toBe('progressbar')
    expect(track?.attributes.get('aria-label')).toBe(CROSSHAIR_BREAK_PROGRESS_LABEL)
    expect(track?.attributes.get('aria-valuemin')).toBe('0')
    expect(track?.attributes.get('aria-valuemax')).toBe('100')
    expect(track?.attributes.has('aria-valuenow')).toBe(false)
    expect(track?.attributes.has('aria-live')).toBe(false)

    view.render(crosshairViewModel({ ...aiming, breakProgress: 0 }, 0))
    expect(track?.attributes.has('hidden')).toBe(false)
    expect(track?.attributes.get('aria-valuenow')).toBe('0')
    expect(fill?.style.properties.get('width')).toBe('0%')

    view.render(crosshairViewModel(aiming, 0))
    expect(track?.attributes.has('hidden')).toBe(true)
    expect(track?.attributes.has('aria-valuenow')).toBe(false)
  })

  it('projects partial and complete progress without moving with the hit pulse', () => {
    const { root, view } = mount('full')

    view.render(
      crosshairViewModel({ modals: [], lastHitAtSecs: 0, breakProgress: 0.375 }, 0),
    )
    expect(progressFill(root)?.style.properties.get('width')).toBe('37.5%')
    expect(progress(root)?.style.properties.get('transform')).toBe('translateX(-50%)')
    expect(root.children.map((child) => child.attributes.get('data-mx-ui'))).toStrictEqual([
      'crosshair-mark',
      'crosshair-progress',
    ])

    view.render(crosshairViewModel({ ...aiming, breakProgress: 1 }, 0))
    expect(progressFill(root)?.style.properties.get('width')).toBe('100%')
  })

  it('does not mutate the DOM when progress is unchanged', () => {
    const { factory, view } = mount()
    const model = crosshairViewModel({ ...aiming, breakProgress: 0.5 }, 0)

    view.render(model)
    const before = factory.mark()
    view.render(model)
    expect(writeNames(factory.since(before))).toStrictEqual([])
  })
})

describe('crosshairViewModel input guards', () => {
  it.each([
    { label: 'null', value: null },
    { label: 'not an array', value: 7 },
    { label: 'unknown screen id', value: ['unknown'] },
    { label: 'null screen id', value: [null] },
  ])('returns a typed failure when modals are $label', ({ value }) => {
    const status: CrosshairStatus = { ...aiming }
    expect(Reflect.set(status, 'modals', value)).toBe(true)

    expect(crosshairViewModelResult(status, 0)).toStrictEqual(
      Result.fail({ _tag: 'InvalidCrosshairViewModelInput', field: 'modals' }),
    )
  })

  it('returns a typed failure for an explicit null last-hit timestamp', () => {
    const status: CrosshairStatus = { ...aiming }
    expect(Reflect.set(status, 'lastHitAtSecs', null)).toBe(true)

    expect(crosshairViewModelResult(status, 0)).toStrictEqual(
      Result.fail({ _tag: 'InvalidCrosshairViewModelInput', field: 'lastHitAtSecs' }),
    )
  })

  it('returns a typed failure for an explicit null current timestamp', () => {
    const result = Reflect.apply(crosshairViewModelResult, undefined, [aiming, null])

    expect(result).toStrictEqual(Result.fail({ _tag: 'InvalidCrosshairViewModelInput', field: 'nowSecs' }))
  })

  it('returns a typed failure for an explicit null pulse duration', () => {
    const result = Reflect.apply(crosshairViewModelResult, undefined, [aiming, 0, null])

    expect(result).toStrictEqual(Result.fail({ _tag: 'InvalidCrosshairViewModelInput', field: 'pulseSecs' }))
  })

  it.each([
    { label: 'NaN current time', nowSecs: Number.NaN, pulseSecs: CROSSHAIR_PULSE_SECS, field: 'nowSecs' },
    { label: 'infinite current time', nowSecs: Number.POSITIVE_INFINITY, pulseSecs: CROSSHAIR_PULSE_SECS, field: 'nowSecs' },
    { label: 'infinite last-hit time', nowSecs: 0, pulseSecs: CROSSHAIR_PULSE_SECS, lastHitAtSecs: Number.POSITIVE_INFINITY, field: 'lastHitAtSecs' },
    { label: 'negative pulse duration', nowSecs: 0, pulseSecs: -1, field: 'pulseSecs' },
  ])('returns a typed failure for $label', ({ nowSecs, pulseSecs, lastHitAtSecs, field }) => {
    const status: CrosshairStatus = { ...aiming }
    if (typeof lastHitAtSecs !== 'undefined') {
      expect(Reflect.set(status, 'lastHitAtSecs', lastHitAtSecs)).toBe(true)
    }
    const result = Reflect.apply(crosshairViewModelResult, undefined, [status, nowSecs, pulseSecs])

    expect(result).toStrictEqual(Result.fail({ _tag: 'InvalidCrosshairViewModelInput', field }))
  })

  it('property: arbitrary public inputs return a typed failure or a valid view model', () => {
    const screenIds: ReadonlyArray<ScreenId> = [
      'pause',
      'settings',
      'inventory',
      'crafting',
      'chat',
      'achievements',
      'statistics',
    ]
    const isRecord = (input: unknown): input is Record<string, unknown> =>
      input !== null && typeof input === 'object' && !Array.isArray(input)
    const isFiniteNumber = (input: unknown): input is number =>
      typeof input === 'number' && Number.isFinite(input)

    fc.assert(
      fc.property(fc.anything(), fc.anything(), fc.anything(), (status, nowSecs, pulseSecs) => {
        const result = Reflect.apply(crosshairViewModelResult, undefined, [status, nowSecs, pulseSecs])
        const pulseDuration = typeof pulseSecs === 'undefined' ? CROSSHAIR_PULSE_SECS : pulseSecs
        const record = isRecord(status) ? status : undefined
        const modals: unknown = typeof record === 'undefined' ? undefined : Reflect.get(record, 'modals')
        const progress: unknown = typeof record === 'undefined' ? undefined : Reflect.get(record, 'breakProgress')
        const lastHitAtSecs: unknown = typeof record === 'undefined' ? undefined : Reflect.get(record, 'lastHitAtSecs')
        const validModals = Array.isArray(modals) && Array.from(modals).every((screen) =>
          typeof screen === 'string' && screenIds.some((knownScreen) => knownScreen === screen),
        )
        const validProgress = typeof progress === 'undefined' || isFiniteNumber(progress)
        const validLastHit = typeof lastHitAtSecs === 'undefined' || isFiniteNumber(lastHitAtSecs)
        const validNow = isFiniteNumber(nowSecs)
        const validPulse = isFiniteNumber(pulseDuration) && pulseDuration >= 0
        const expectedSuccess = record !== undefined && validModals && validProgress && validLastHit && validNow && validPulse

        expect(Result.isSuccess(result)).toBe(expectedSuccess)
        if (Result.isFailure(result)) {
          expect(result.failure._tag).toBe('InvalidCrosshairViewModelInput')
          expect([
            'breakProgress',
            'lastHitAtSecs',
            'modals',
            'nowSecs',
            'pulseSecs',
            'status',
          ]).toContain(result.failure.field)
          return
        }

        if (!Array.isArray(modals)) {
          return
        }
        if (modals.length > 0) {
          expect(result.success).toBeUndefined()
          return
        }
        const since = isFiniteNumber(nowSecs) && isFiniteNumber(lastHitAtSecs)
          ? nowSecs - lastHitAtSecs
          : undefined
        expect(result.success).toStrictEqual({
          breakProgress: isFiniteNumber(progress) ? Math.min(1, Math.max(0, progress)) : undefined,
          hit: typeof since === 'number' && isFiniteNumber(pulseDuration) && since >= 0 && since < pulseDuration,
        })
      }),
      { numRuns: 100 },
    )
  })
})

describe('the hit marker is a duration, not a timer (DN-UI-10)', () => {
  it('REGRESSION: marks a landed hit for exactly CROSSHAIR_PULSE_SECS', () => {
    // `<reference-impl>/packages/presentation/hud/crosshair.ts:141` does this
    // with `setTimeout(resetPulse, 120)` — a wall-clock timer inside a renderer,
    // which plan.md §4.3 bans repository-wide.
    expect(crosshairViewModel(hitAt(0), 0)?.hit).toBe(true)
    expect(crosshairViewModel(hitAt(0), CROSSHAIR_PULSE_SECS - 0.001)?.hit).toBe(true)
    expect(crosshairViewModel(hitAt(0), CROSSHAIR_PULSE_SECS)?.hit).toBe(false)
    expect(CROSSHAIR_PULSE_SECS).toBe(0.12)
  })

  it('REGRESSION: a hit that has not happened yet is not a hit', () => {
    // The reference cannot express this — a timer only ever counts forward from
    // now. A frame handed a `lastHitAtSecs` in the future is a clock disagreement
    // between whoever recorded the swing and whoever is rendering, and showing a
    // hit marker for it would tell the player they connected before they swung.
    // Just INSIDE the pulse window, on the wrong side of now. A hit five seconds
    // in the future is rejected by the window alone and would let an
    // `Math.abs(since)` through unnoticed; this is the case that separates
    // 「within 120 ms」 from 「within 120 ms and already happened」.
    expect(crosshairViewModel(hitAt(0.05), 0)?.hit).toBe(false)
    expect(crosshairViewModel(hitAt(5), 1)?.hit).toBe(false)
    expect(crosshairViewModelResult(hitAt(Number.NaN), 1)).toStrictEqual(
      Result.fail({ _tag: 'InvalidCrosshairViewModelInput', field: 'lastHitAtSecs' }),
    )
    expect(crosshairViewModel(aiming, 1)?.hit).toBe(false)
  })

  it('REGRESSION: nothing here schedules anything, so nothing can fire into a dead reticle', () => {
    // The reference has to hold a `pulseTimeoutRef` and clear it on `hide`, on
    // `toggle` and on every re-pulse, because a timer outlives the thing it was
    // about. There is nothing to clear here: the marker is a subtraction
    // performed at read time, so taking the crosshair down cannot leave anything
    // pending.
    const { root, view } = mount()
    view.render(crosshairViewModel(hitAt(0), 0))
    expect(root.attributes.get('data-crosshair-hit')).toBe('')

    view.render(crosshairViewModel({ modals: ['inventory'], lastHitAtSecs: 0 }, 0))
    expect(root.attributes.has('hidden')).toBe(true)
    expect(root.listenersInTree()).toStrictEqual([])
  })

  it('notifies an immediate hit on a visible reticle and the next frame owns expiry', () => {
    const { root, view } = mount('reduced')
    view.render({ breakProgress: 0.375, hit: false })

    view.notifyHit()
    expect(root.attributes.get('data-crosshair-hit')).toBe('')
    expect(thicknessOf(root)).toStrictEqual([
      CROSSHAIR_ARM_HIT_WEIGHT,
      CROSSHAIR_ARM_HIT_WEIGHT,
    ])
    expect(root.find('data-mx-ui', 'crosshair-mark')?.style.properties.has('transform')).toBe(false)

    view.render({ breakProgress: 0.375, hit: false })
    expect(root.attributes.has('data-crosshair-hit')).toBe(false)
  })

  it('leaves a hidden reticle hidden when a hit notification arrives', () => {
    const { root, view } = mount()
    view.notifyHit()

    expect(root.attributes.has('hidden')).toBe(true)
    expect(root.attributes.has('data-crosshair-hit')).toBe(false)
  })

  it('property: a notification marks any visible break-progress model as hit', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.double({ min: 0, max: 1, noNaN: true }), (hit, breakProgress) => {
        const { root, view } = mount('reduced')
        view.render({ breakProgress, hit })
        view.notifyHit()
        expect(root.attributes.get('data-crosshair-hit')).toBe('')
        expect(progress(root)?.attributes.has('hidden')).toBe(false)
      }),
      { numRuns: 50 },
    )
  })

  it('REGRESSION: the hit is carried by WEIGHT, so reduced motion loses no information', () => {
    // `crosshair.ts:26` scales to 1.45 and recolours the shadow. A scale is a
    // decorative animation, which `domain/accessibility.ts` requires to be
    // suppressed under reduced motion — and suppressing it would leave that
    // player with NO hit feedback, which is the same mistake as the reference's
    // frozen loading bar: the accessible path silently loses the signal instead
    // of carrying it differently.
    const reduced = mount('reduced')
    reduced.view.render(crosshairViewModel(hitAt(0), 0))

    // The weight moved even though the animation did not.
    expect(thicknessOf(reduced.root)).toStrictEqual([
      CROSSHAIR_ARM_HIT_WEIGHT,
      CROSSHAIR_ARM_HIT_WEIGHT,
    ])
    expect(
      reduced.root.find('data-mx-ui', 'crosshair-mark')?.style.properties.has('transform'),
    ).toBe(false)

    const full = mount('full')
    full.view.render(crosshairViewModel(hitAt(0), 0))
    expect(thicknessOf(full.root)).toStrictEqual([
      CROSSHAIR_ARM_HIT_WEIGHT,
      CROSSHAIR_ARM_HIT_WEIGHT,
    ])
    expect(full.root.find('data-mx-ui', 'crosshair-mark')?.style.properties.get('transform')).toBe(
      `scale(${String(CROSSHAIR_PULSE_SCALE)})`,
    )
  })

  it('REGRESSION: the scale is REMOVED when the hit ends, not set to scale(1)', () => {
    // `application/dom-write.ts` on `clearStyle`: a transform that is always
    // present is a compositing layer that is always present, and 「no animation」
    // should be expressible as the absence of one.
    const { root, view } = mount('full')
    view.render(crosshairViewModel(hitAt(0), 0))
    view.render(crosshairViewModel(hitAt(0), 1))

    const mark = root.find('data-mx-ui', 'crosshair-mark')
    expect(mark?.style.properties.has('transform')).toBe(false)
    // And the centring translate on the ROOT survived it, because the two live
    // on different elements. One `transform` carrying both would move the reticle
    // off the point it marks the moment the pulse was cleared.
    expect(root.style.properties.get('transform')).toBe('translate(-50%, -50%)')
  })

  it('setMotion re-projects without a re-render, and is a no-op when unchanged', () => {
    const { factory, root, view } = mount('full')
    view.render(crosshairViewModel(hitAt(0), 0))

    view.setMotion('reduced')
    expect(root.find('data-mx-ui', 'crosshair-mark')?.style.properties.has('transform')).toBe(false)

    const before = factory.mark()
    view.setMotion('reduced')
    expect(writeNames(factory.since(before))).toStrictEqual([])
  })
})

describe('the crosshair keeps the palette’s guarantee instead of leaving it', () => {
  it('REGRESSION: the mark and progress bar stay within the INK-on-SCRIM palette', () => {
    // `domain/palette.ts`: 「content that leaves it leaves the guarantee with
    // it」. A reticle cannot sit on a scrim panel — that is a grey box in the
    // middle of the screen — so it takes a scrim-sized piece of scrim with it.
    const { root, view } = mount()
    view.render(crosshairViewModel(aiming, 0))

    expect(root.style.properties.get(PALETTE_PROPERTY.ink)).toBeDefined()
    for (const arm of arms(root)) {
      expect(arm.style.properties.get('background-color')).toBe(PALETTE_VAR.ink)
      expect(arm.style.properties.get('box-shadow')).toBe(
        `0 0 0 ${CROSSHAIR_HALO_WIDTH} ${PALETTE_VAR.scrim}`,
      )
    }
    expect(progress(root)?.style.properties.get('background-color')).toBe(PALETTE_VAR.scrim)
    expect(progressFill(root)?.style.properties.get('background-color')).toBe(PALETTE_VAR.ink)
  })

  it('REGRESSION: its floor is a number the survey ALREADY measures — no new token', () => {
    // The point of the halo: because the mark sits on `SCRIM`, its worst case
    // over any world pixel is `worstCaseContrastOnScrim(INK)`, which
    // `surveyPalette()` computes for the HUD's body text and which every other
    // test in this repository already pins. Adding a `CROSSHAIR` token instead
    // would have meant a new contrast measurement, a new all-pairs collision
    // against `SLOT_SELECTED` (white on white, 0 apart), and an exemption to
    // explain it away.
    const reading = surveyPalette().tokens.find((token) => token.name === 'INK')

    expect(reading?.meetsFloor).toBe(true)
    expect(reading?.boundIsExact).toBe(true)
    // Comfortably past the ICON floor the reticle is judged by, not merely past
    // it. If INK ever moves, this is the assertion that notices.
    expect(reading?.worstContrast ?? 0).toBeGreaterThan(UI_CONTRAST_MIN * 4)
    expect(GUARDED_TOKENS.some((token) => token.name === 'INK' && token.on === 'scrim')).toBe(true)
  })

  it('REGRESSION: the reference’s blend mode fails in the MIDDLE of the range, and is not carried', () => {
    // `crosshair.ts:19` uses `mix-blend-mode: difference`, and
    // `crosshair.test.ts:296` — 「should protect crosshair contrast against
    // bright and dark backgrounds」 — asserts only that the property is present.
    // The test names the two cases it is safe at.
    //
    // `difference` composites to `|backdrop - source|`. White arms over a
    // mid-grey world pixel land on a nearly identical grey, and the black
    // drop-shadow differences back to the backdrop exactly, so the mark AND its
    // halo disappear together. Stone, water and most things at dusk sit there.
    const difference = (backdrop: Rgb, source: Rgb): Rgb => [
      Math.abs(backdrop[0] - source[0]),
      Math.abs(backdrop[1] - source[1]),
      Math.abs(backdrop[2] - source[2]),
    ]
    const white: Rgb = [255, 255, 255]
    const black: Rgb = [0, 0, 0]
    const midGrey: Rgb = [128, 128, 128]

    // The reference's arms, blended, against the world they are blended with.
    expect(contrastRatio(difference(midGrey, white), midGrey)).toBeLessThan(1.1)
    // And its halo, which is meant to be the safety net, is exactly the backdrop.
    expect(contrastRatio(difference(midGrey, black), midGrey)).toBeCloseTo(1, 5)

    // mx-ui's arms are opaque INK on an opaque-enough SCRIM halo, so the number
    // does not depend on the world at all — that is the whole reason for the
    // halo, and `worstCaseContrastOnScrim` is exact about it.
    const ours = surveyPalette().tokens.find((token) => token.name === 'INK')?.worstContrast ?? 0
    expect(ours).toBeGreaterThan(contrastRatio(difference(midGrey, white), midGrey) * 10)
    expect(INK).toStrictEqual([240, 240, 240])
  })

  it('REGRESSION: writes no colour and no text on a hit — only weight and one attribute', () => {
    // The frame path. `ui:hud-sync` runs every frame and a hit lands on a few of
    // them; the colours are `var(...)` references installed at mount, so a hit
    // swaps nothing.
    const { factory, view } = mount('reduced')
    view.render(crosshairViewModel(aiming, 0))

    const before = factory.mark()
    view.render(crosshairViewModel(hitAt(0), 0))
    const written = writeNames(factory.since(before))

    expect(written.filter((name) => name === 'text:textContent')).toStrictEqual([])
    expect(written).toStrictEqual([
      'attribute:data-crosshair-hit',
      'style:width',
      'style:height',
    ])
  })

  it('REGRESSION: a re-render with an unchanged model mutates nothing at all', () => {
    const { factory, view } = mount()
    const model = crosshairViewModel(hitAt(0), 0)

    view.render(model)
    const before = factory.mark()
    view.render(model)
    expect(writeNames(factory.since(before))).toStrictEqual([])
  })

  it('keeps the decorative mark hidden without hiding progress semantics', () => {
    const { root, view } = mount()
    view.render(crosshairViewModel({ ...aiming, breakProgress: 0.5 }, 0))

    expect(root.attributes.has('aria-hidden')).toBe(false)
    expect(root.find('data-mx-ui', 'crosshair-mark')?.attributes.get('aria-hidden')).toBe('true')
    expect(progress(root)?.attributes.get('aria-label')).toBe(CROSSHAIR_BREAK_PROGRESS_LABEL)
    for (const element of root.walk()) {
      expect(element.attributes.has('tabindex')).toBe(false)
      expect(element.attributes.has('aria-live')).toBe(false)
    }
    // And it never eats a click, which is the property the reference carries in
    // the same breath (`crosshair.ts:17`): a mark sitting exactly where every
    // click lands would otherwise swallow the clicks aiming exists for.
    expect(root.style.properties.get('pointer-events')).toBe('none')
  })

  it('rests at the weight the reference rests at', () => {
    const { root, view } = mount()
    view.render(crosshairViewModel(aiming, 0))
    expect(thicknessOf(root)).toStrictEqual([CROSSHAIR_ARM_WEIGHT, CROSSHAIR_ARM_WEIGHT])
    expect(CROSSHAIR_ARM_WEIGHT).toBe('2px')
  })
})
