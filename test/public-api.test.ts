/**
 * The barrel is pinned explicitly.
 *
 * `index.ts` is what mc-compose imports. A re-export dropped from it is
 * invisible to every other test here — they all import the modules directly —
 * while breaking the only consumer that matters. Same reasoning as
 * `mc-kernel/test/public-api.test.ts`.
 *
 * The accessibility block below is pinned for a second reason on top of that
 * one. plan.md §3.13 asks for those four assets to be CARRIED OVER from the
 * reference, and an asset that is carried over and then quietly dropped is
 * indistinguishable from one that was never carried over. Listing them by name
 * makes the drop a test failure.
 */
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import * as ui from '../index'
import { rebind } from '../domain/accessibility'
import { hudViewModel } from '../domain/hud-view-model'
import { escapePressed } from '../domain/modal-stack'
import { UI_STAGE_IDS } from '../stages/stage-ids'

describe('public API surface', () => {
  it.effect('re-exports the stage registration contract — the part mc-compose actually consumes', () =>
    Effect.sync(() => {
      const contract = [
        'uiStages',
        'makeUiStages',
        // the full plan.md §4.1 module — Layer plus an Effect-valued
        // `frameStages`. Expressible only since the vertical-slice spike; see
        // `stages/registration.ts` on why the array was the obstacle.
        'uiModule',
        'makeUiFrameState',
        'UI_STAGE_IDS',
        'UPSTREAM_STAGE_IDS',
      ]

      for (const name of contract) {
        expect(Object.keys(ui)).toContain(name)
      }
    }),
  )

  // REGRESSION: `domain/frame-contract.ts` is a stand-in for
  // @nerima-games/mc-kernel with a deletion date written into its header. The
  // barrel used to `export *` from it, which published `StageId` and
  // `DeltaTimeSecs` as API of a package that does not own them — and therefore
  // turned the promised deletion into a breaking change for every consumer.
  // mc-sim, mc-render and mc-playground-kit mention their mirrors in an
  // `index.ts` comment and re-export nothing; this repository now matches.
  it.effect('REGRESSION: does not republish mc-kernel’s vocabulary as its own', () =>
    Effect.sync(() => {
      const kernelsToOwn = ['StageId', 'DeltaTimeSecs']
      for (const name of kernelsToOwn) {
        expect(Object.keys(ui)).not.toContain(name)
      }
    }),
  )

  it.effect('REGRESSION: every accessibility asset plan.md §3.13 asks to carry over is still exported', () =>
    Effect.sync(() => {
      const accessibility = [
        // 色覚モード — feColorMatrix daltonisation, canvas only
        'COLOR_VISION_MODES',
        'COLOR_VISION_FILTER_TARGET',
        'colorVisionAttribute',
        // …and the daltonisation ITSELF. The four names above are the SWITCH,
        // and a switch with no matrix behind it corrects nothing: the reference
        // kept the matrices in `index.html:445-460` and they were left there
        // when the rest was carried over. `pnpm preview --stats` reported the
        // half-carry as F5. Pinned here for the same reason as everything else
        // in this list — carried over and then quietly dropped is
        // indistinguishable from never carried over.
        'colorVisionMatrix',
        'colorVisionMatrixValues',
        'applyColorVisionMatrix',
        'COLOR_VISION_FILTER_COLOR_SPACE',
        // reduced-motion
        'resolveMotionPreference',
        'animationDurationMs',
        'shouldAnimate',
        // キーリマッピングUI
        'REBIND_CLEAR_KEYS',
        'rebind',
        'unboundActions',
        // サウンド字幕
        'MAX_VISIBLE_CAPTIONS',
        'CAPTION_LIFETIME_SECS',
        'emptyCaptionQueue',
        'receiveCaption',
        'expireCaptions',
        'captionLines',
      ]

      for (const name of accessibility) {
        expect(Object.keys(ui)).toContain(name)
      }
    }),
  )

  it.effect('re-exports the view-model domain and the modal stack, which the per-screen previews drive', () =>
    Effect.sync(() => {
      const internal = [
        'HEALTH_POINTS_PER_HEART',
        'DEFAULT_MAX_HEALTH_POINTS',
        'DEFAULT_MAX_HUNGER_POINTS',
        'HOTBAR_SLOT_COUNT',
        'iconRow',
        'hudViewModel',
        'spawnSnapshot',
        'emptyModalStack',
        'topOf',
        'openScreen',
        'closeScreen',
        'escapePressed',
        'gameplayInputSuppressed',
        'pointerLockReleased',
        'DEFAULT_CAPTION_SETTINGS',
        'EXPERIENCE_MODULE_STAGE_PREFIXES',
        'OWN_STAGE_PREFIX',
      ]

      for (const name of internal) {
        expect(Object.keys(ui)).toContain(name)
      }
    }),
  )

  it.effect('re-exports the DOM layer — the part that turns a view model into elements', () =>
    Effect.sync(() => {
      const dom = [
        // The renderers.
        'createHudView',
        'createCaptionView',
        'createInventoryView',
        // The palette's consumer. Until this existed, the guarantee in
        // `domain/palette.ts` was proved about numbers and about nothing on a
        // screen — `docs/testing.md` §4 criterion 4 was ⚠️ for exactly that.
        'declarePalette',
        'PALETTE_PROPERTY',
        'PALETTE_VAR',
        'PALETTE_VALUE',
        // The colour-vision switch, finally with a consumer (DN-UI-1a).
        'applyColorVision',
        'COLOR_VISION_ATTRIBUTE',
      ]

      for (const name of dom) {
        expect(Object.keys(ui)).toContain(name)
      }
    }),
  )

  it.effect('REGRESSION: exports no way for a renderer to take a key (DN-UI-4)', () =>
    Effect.sync(() => {
      // The Escape decision has one owner: `escapePressed`, at frame level, paired
      // with mc-render's input design. The barrel must not hand a consumer a
      // renderer-side listener API, because the second owner is how one press
      // closes two screens.
      const listenerShaped = Object.keys(ui).filter(
        (name) => name.toLowerCase().includes('listener') || name.toLowerCase().includes('eventtarget'),
      )
      expect(listenerShaped).toStrictEqual([])
    }),
  )

  it.effect('exposes the same implementations through the barrel as through the modules', () =>
    Effect.sync(() => {
      expect(ui.rebind).toBe(rebind)
      expect(ui.hudViewModel).toBe(hudViewModel)
      expect(ui.escapePressed).toBe(escapePressed)
      expect(ui.UI_STAGE_IDS).toBe(UI_STAGE_IDS)
    }),
  )

  it.effect('REGRESSION: exports nothing that would let a consumer resolve a total stage order', () =>
    Effect.sync(() => {
      // plan.md §2.3-3: the total order is mc-compose's alone.
      const forbidden = ['sortStages', 'stageOrder', 'totalOrder', 'framePipeline', 'runFrame']
      for (const name of forbidden) {
        expect(Object.keys(ui)).not.toContain(name)
      }
    }),
  )
})
