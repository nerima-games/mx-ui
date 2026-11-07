import { AudioCaptionText, AudioPan, SoundCueId, type CaptionEvent } from '@nerima-games/mc-audio'
import {
  AchievementIdSchema,
  AngleRadians,
  DeltaTimeSecs,
  EntityIdSchema,
  MonotonicTimeSecs,
  SimulationTickSchema,
  StackCount,
  type ItemStackFailure,
  itemStack,
} from '@nerima-games/mc-kernel'
import { Result, Schema } from 'effect'
import {
  SPAWN_VITALS,
  VitalsSchema,
  type InventoryCarriedSlot,
  type Vitals,
} from '@nerima-games/mc-sim'
import type { ScenarioDefinition, ScenarioMount } from '../scenario-types'
import { createAchievementToastView } from '../../../src/application/achievement-toast-view'
import { createCaptionView } from '../../../src/application/caption-view'
import { createCrosshairView } from '../../../src/application/crosshair-view'
import { createDebugOverlayView } from '../../../src/application/debug-overlay-view'
import { createHudView } from '../../../src/application/hud-view'
import { createLoadingView } from '../../../src/application/loading-view'
import { createSaveIndicator } from '../../../src/application/save-indicator'
import {
  AchievementToastSchema,
  AchievementToastIconSchema,
  AchievementToastTitleSchema,
  type AchievementToast,
} from '../../../src/domain/achievement-toast'
import {
  CAPTION_DISPLAY_SECS,
  MAX_VISIBLE_CAPTIONS,
  captionLines,
  type CaptionLineView,
} from '../../../src/domain/caption'
import {
  CROSSHAIR_PULSE_SECS,
  IDLE_CROSSHAIR_STATUS,
  crosshairViewModel,
  type CrosshairStatus,
} from '../../../src/domain/crosshair'
import {
  FramesPerSecondSchema,
  GpuTimeMillisecondsSchema,
  type DebugOverlayModel,
} from '../../../src/domain/debug-overlay'
import {
  HOTBAR_SLOT_COUNT,
  hudViewModel,
} from '../../../src/domain/hud-view-model'
import {
  LOADING_MINIMUM_VISIBLE_SECS,
  loadingScreenView,
  loadingStatus,
  type LoadingProgress,
} from '../../../src/domain/loading-screen'
import {
  IDLE_SAVE_STATUS,
  SAVED_VISIBLE_SECS,
  saveStatus,
  saveStatusMessage,
  type SaveState,
} from '../../../src/domain/save-status'

const noTimeUpdate = (_seconds: number): void => undefined
const noDispose = (): void => undefined

export const OVERLAY_TIME_BOUNDARIES: Readonly<{
  achievementToastDismissalSecs: number
  achievementToastSecondAtSecs: number
  captionExpirySecs: number
  crosshairPulseSecs: number
  loadingMinimumVisibleSecs: number
  savedVisibleSecs: number
}> = {
  achievementToastDismissalSecs: 3,
  achievementToastSecondAtSecs: 1.5,
  captionExpirySecs: CAPTION_DISPLAY_SECS,
  crosshairPulseSecs: CROSSHAIR_PULSE_SECS,
  loadingMinimumVisibleSecs: LOADING_MINIMUM_VISIBLE_SECS,
  savedVisibleSecs: SAVED_VISIBLE_SECS,
}

const scenario = (
  screen: string,
  id: string,
  title: string,
  surface: string,
  mount: ScenarioDefinition['mount'],
): ScenarioDefinition => ({ screen, id, title, surface, isDefault: false, mount })

const decodeVitals = Schema.decodeUnknownResult(VitalsSchema, { onExcessProperty: 'error' })

const validVitals = (input: unknown): Vitals => {
  const decoded = decodeVitals(input)
  if (Result.isFailure(decoded)) {
    throw decoded.failure
  }
  return decoded.success
}

const emptyHotbar: ReadonlyArray<InventoryCarriedSlot> = Array.from(
  { length: HOTBAR_SLOT_COUNT },
  (): InventoryCarriedSlot => undefined,
)

const fullStackResult = itemStack('stone', StackCount(64))
if (Result.isFailure(fullStackResult) || fullStackResult.success === undefined) {
  throw new Error('browser-harness: expected a full stone hotbar stack')
}
const fullHotbar: ReadonlyArray<InventoryCarriedSlot> = [
  fullStackResult.success,
  ...emptyHotbar.slice(1),
]

const vitalsFor = (
  healthPoints: number,
  hungerPoints: number,
  totalExperience = 0,
): Vitals =>
  validVitals({
    ...SPAWN_VITALS,
    healthPoints,
    hungerPoints,
    saturation: Math.min(SPAWN_VITALS.saturation, hungerPoints),
    totalExperience,
  })

const mountHud = (
  context: Parameters<ScenarioDefinition['mount']>[0],
  vitals: Vitals,
  hotbar: ReadonlyArray<InventoryCarriedSlot> = emptyHotbar,
): ScenarioMount => {
  const view = createHudView(context.factory, context.host, context.environment.motion)
  const model = hudViewModel(vitals, hotbar, 0)
  view.render(model)
  return { root: view.root, setTime: noTimeUpdate, dispose: noDispose, viewModel: () => model }
}

const failedReason = (reason: string): LoadingProgress => ({ kind: 'failed', reason })

const renderLoading = (
  progress: LoadingProgress,
  startedAtSecs: number,
  context: Parameters<ScenarioDefinition['mount']>[0],
): ScenarioMount => {
  const view = createLoadingView(context.factory, context.host)
  let model = loadingScreenView(loadingStatus(progress, startedAtSecs), context.time)
  const update = (seconds: number): void => {
    model = loadingScreenView(loadingStatus(progress, startedAtSecs), seconds)
    view.render(model)
  }
  update(context.time)
  return { root: view.root, setTime: update, dispose: noDispose, viewModel: () => model }
}

const captionsAt = (events: ReadonlyArray<CaptionEvent>, seconds: number): ReadonlyArray<CaptionLineView> =>
  captionLines(events, MonotonicTimeSecs(seconds))

const captionEvent = (
  text: string,
  atSecs: number,
  pan: number | undefined,
  reason: CaptionEvent['reason'],
): CaptionEvent => ({
  cueId: SoundCueId('blockBreak'),
  text: AudioCaptionText(text),
  atSecs: MonotonicTimeSecs(atSecs),
  reason,
  ...(typeof pan === 'undefined' ? {} : { pan: AudioPan(pan) }),
})

const renderCaptions = (
  events: ReadonlyArray<CaptionEvent>,
  context: Parameters<ScenarioDefinition['mount']>[0],
): ScenarioMount => {
  const view = createCaptionView(context.factory, context.host, context.environment.motion)
  let model = captionsAt(events, context.time)
  const update = (seconds: number): void => {
    model = captionsAt(events, seconds)
    view.render(model)
  }
  update(context.time)
  return { root: view.root, setTime: update, dispose: noDispose, viewModel: () => model }
}

const renderCrosshair = (
  statusAt: (seconds: number) => CrosshairStatus,
  context: Parameters<ScenarioDefinition['mount']>[0],
): ScenarioMount => {
  const view = createCrosshairView(context.factory, context.host, context.environment.motion)
  let model = crosshairViewModel(statusAt(context.time), context.time)
  const update = (seconds: number): void => {
    model = crosshairViewModel(statusAt(seconds), seconds)
    view.render(model)
  }
  update(context.time)
  return { root: view.root, setTime: update, dispose: noDispose, viewModel: () => model }
}

const emptyDebugModel: DebugOverlayModel = {
  biome: null,
  chunk: null,
  coordinates: null,
  dimension: null,
  facing: null,
  fps: null,
  frameDeltaSecs: null,
  gpuTimingSupported: null,
  latestGpuTimeMs: null,
  qualityPreset: null,
  worldTime: null,
}

const allDebugValues: DebugOverlayModel = {
  ...emptyDebugModel,
  coordinates: { worldX: -12.5, worldY: 64, worldZ: 300.25 },
  dimension: 'overworld',
  facing: { pitchRadians: AngleRadians(-0.25), yawRadians: AngleRadians(1.5) },
  fps: Schema.decodeUnknownSync(FramesPerSecondSchema)(60),
  frameDeltaSecs: DeltaTimeSecs(1 / 60),
  gpuTimingSupported: true,
  latestGpuTimeMs: Schema.decodeUnknownSync(GpuTimeMillisecondsSchema)(3.5),
  qualityPreset: 'high',
  worldTime: { ticks: 12_345, dayLengthTicks: 24_000 },
}

const extremeDebugValues: DebugOverlayModel = {
  ...allDebugValues,
  fps: Schema.decodeUnknownSync(FramesPerSecondSchema)(Number.MAX_VALUE),
  latestGpuTimeMs: Schema.decodeUnknownSync(GpuTimeMillisecondsSchema)(-0.5),
}

const makeToast = (title: string, icon = 'minecraft:wooden_pickaxe'): AchievementToast =>
  Schema.decodeUnknownSync(AchievementToastSchema)({
    achievement: Schema.decodeUnknownSync(AchievementIdSchema)('minecraft:story/mine_stone'),
    icon: Schema.decodeUnknownSync(AchievementToastIconSchema)(icon),
    player: Schema.decodeUnknownSync(EntityIdSchema)('player:one'),
    tick: Schema.decodeUnknownSync(SimulationTickSchema)(7),
    title: Schema.decodeUnknownSync(AchievementToastTitleSchema)(title),
  })

const mountToast = (
  toast: AchievementToast | undefined,
  context: Parameters<ScenarioDefinition['mount']>[0],
): ScenarioMount => {
  const view = createAchievementToastView(context.factory, context.host)
  view.render(toast)
  return { root: view.root, setTime: noTimeUpdate, dispose: noDispose, viewModel: () => toast }
}

const mountToastDecodeFailure = (
  context: Parameters<ScenarioDefinition['mount']>[0],
): ScenarioMount => {
  const decoded = Schema.decodeUnknownResult(AchievementToastSchema)({
    achievement: Schema.decodeUnknownSync(AchievementIdSchema)('minecraft:story/mine_stone'),
    player: Schema.decodeUnknownSync(EntityIdSchema)('player:one'),
    tick: Schema.decodeUnknownSync(SimulationTickSchema)(7),
    title: Schema.decodeUnknownSync(AchievementToastTitleSchema)('Stone Age'),
  })
  if (Result.isSuccess(decoded)) {
    throw new Error('browser-harness: missing achievement icon unexpectedly decoded')
  }
  const root = context.factory.createElement('section')
  root.setAttribute('data-mx-ui', 'achievement-toast-decode-failure')
  root.setAttribute('role', 'alert')
  root.textContent = `Achievement toast decode failed: ${decoded.failure.message}`
  context.host.appendChild(root)
  const model = { kind: 'decode-failure', reason: decoded.failure.message }
  return { root, setTime: noTimeUpdate, dispose: noDispose, viewModel: () => model }
}

const mountDecodeFailure = (
  surface: string,
  message: string,
  context: Parameters<ScenarioDefinition['mount']>[0],
): ScenarioMount => {
  const root = context.factory.createElement('section')
  root.setAttribute('data-mx-ui', `${surface}-decode-failure`)
  root.setAttribute('role', 'alert')
  root.textContent = `${surface} boundary rejected: ${message}`
  context.host.appendChild(root)
  const model = { kind: 'decode-failure', surface, reason: message }
  return { root, setTime: noTimeUpdate, dispose: noDispose, viewModel: () => model }
}

const itemStackFailureMessage = (failure: ItemStackFailure): string => {
  switch (failure['_tag']) {
    case 'ItemValidationFailure':
      return failure.message
    case 'ItemComponentPatchConflictError':
      return `Conflicting item component patch: ${failure.componentKey}`
    case 'TextComponentFailure':
      return failure.message
    default:
      return failure
  }
}

const mountHudDecodeFailure = (
  context: Parameters<ScenarioDefinition['mount']>[0],
): ScenarioMount => {
  const decoded = decodeVitals({
    ...SPAWN_VITALS,
    healthPoints: SPAWN_VITALS.maxHealthPoints + 1,
  })
  if (Result.isSuccess(decoded)) {
    throw new Error('browser-harness: over-maximum HUD health unexpectedly decoded')
  }
  return mountDecodeFailure('HUD vitals', decoded.failure.message, context)
}

const mountHotbarDecodeFailure = (
  context: Parameters<ScenarioDefinition['mount']>[0],
): ScenarioMount => {
  const decoded = itemStack('stone', StackCount(65))
  if (Result.isSuccess(decoded)) {
    throw new Error('browser-harness: over-maximum stone stack unexpectedly decoded')
  }
  return mountDecodeFailure('HUD hotbar stack', itemStackFailureMessage(decoded.failure), context)
}

const mountDebugDecodeFailure = (
  context: Parameters<ScenarioDefinition['mount']>[0],
): ScenarioMount => {
  const decoded = Schema.decodeUnknownResult(FramesPerSecondSchema)(Number.NaN)
  if (Result.isSuccess(decoded)) {
    throw new Error('browser-harness: NaN debug FPS unexpectedly decoded')
  }
  return mountDecodeFailure('Debug HUD FPS', decoded.failure.message, context)
}

const rejectedBoundaryMessage = (label: string, decode: () => unknown): string => {
  let rejected = false
  let failure: unknown = undefined
  try {
    decode()
  } catch (error) {
    rejected = true
    failure = error
  }
  if (!rejected) {
    throw new Error(`browser-harness: ${label} unexpectedly decoded`)
  }
  if (
    typeof failure === 'object' &&
    failure !== null &&
    'message' in failure &&
    typeof failure.message === 'string'
  ) {
    return `${label}: ${failure.message}`
  }
  throw failure
}

const mountCaptionDecodeFailure = (
  context: Parameters<ScenarioDefinition['mount']>[0],
): ScenarioMount => {
  const messages = [
    rejectedBoundaryMessage('pan above maximum', () => AudioPan(1.01)),
    rejectedBoundaryMessage('negative timestamp', () => MonotonicTimeSecs(-1)),
  ]
  return mountDecodeFailure('Captions', messages.join('\n'), context)
}

const captionTexts = [
  '',
  'x'.repeat(180),
  'First line\nSecond line',
  '✨ achievement',
  'مرحبا بالعالم',
]

const captionBoundaryEvents = captionTexts.map((text) => captionEvent(text, 0, undefined, 'audible'))

const toastSequence = (context: Parameters<ScenarioDefinition['mount']>[0]): ScenarioMount => {
  const first = makeToast('Stone Age')
  const second = makeToast('Getting an Upgrade', 'minecraft:iron_pickaxe')
  const view = createAchievementToastView(context.factory, context.host)
  const secondAt = OVERLAY_TIME_BOUNDARIES.achievementToastSecondAtSecs
  const expiresAt = OVERLAY_TIME_BOUNDARIES.achievementToastDismissalSecs
  let model: AchievementToast | undefined = first
  // The source view has no fade clock; this fixture changes visible toast state using virtual time.
  const update = (seconds: number): void => {
    model = seconds < secondAt ? first : seconds < expiresAt ? second : undefined
    view.render(model)
  }
  update(context.time)
  return { root: view.root, setTime: update, dispose: noDispose, viewModel: () => model }
}

const savedStateAt = (
  state: SaveState,
  statusAtSecs: number,
  context: Parameters<ScenarioDefinition['mount']>[0],
): ScenarioMount => {
  const view = createSaveIndicator(context.factory, context.host)
  const status = saveStatus(state, statusAtSecs)
  let model = saveStatusMessage(status, context.time)
  const update = (seconds: number): void => {
    model = saveStatusMessage(status, seconds)
    view.render(model)
  }
  update(context.time)
  return { root: view.root, setTime: update, dispose: noDispose, viewModel: () => model }
}

const PROGRESS_CASES: ReadonlyArray<number> = [0, 1, -0.25, 1.25, Number.NaN, Number.POSITIVE_INFINITY]

const mountDebugOverlay = (
  model: DebugOverlayModel,
  context: Parameters<ScenarioDefinition['mount']>[0],
): ScenarioMount => {
  const view = createDebugOverlayView(context.factory, context.host)
  view.root.removeAttribute('hidden')
  view.render(model)
  return { root: view.root, setTime: noTimeUpdate, dispose: noDispose, viewModel: () => model }
}

export const OVERLAY_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  scenario('hud', 'hud-zero-health', 'Zero health and empty hotbar', 'hud', (context) =>
    mountHud(context, vitalsFor(0, 2)),
  ),
  scenario('hud', 'hud-half-heart-low-hunger', 'Half heart, low hunger, and XP', 'hud', (context) =>
    mountHud(context, vitalsFor(19, 2, 24)),
  ),
  scenario('hud', 'hud-full-selected-hotbar', 'Full selected hotbar stack', 'hud', (context) =>
    mountHud(context, SPAWN_VITALS, fullHotbar),
  ),
  scenario('hud', 'hud-vitals-decode-failure', 'Over-maximum health is rejected', 'hud', mountHudDecodeFailure),
  scenario('hud', 'hud-hotbar-decode-failure', 'Stone stack above 64 is rejected', 'hud', mountHotbarDecodeFailure),
  scenario('loading', 'loading-preparing', 'Preparing remains visible', 'loading', (context) =>
    renderLoading({ kind: 'preparing' }, context.time, context),
  ),
  scenario('loading', 'loading-ready-floor', 'Ready remains held until 2.5 seconds', 'loading', (context) =>
    renderLoading({ kind: 'ready' }, 0, context),
  ),
  scenario('loading', 'loading-failed-short', 'Failed with a short reason', 'loading', (context) =>
    renderLoading(failedReason('World data could not be loaded'), context.time, context),
  ),
  scenario('loading', 'loading-failed-empty-reason', 'Failed with an empty reason', 'loading', (context) =>
    renderLoading(failedReason(''), context.time, context),
  ),
  scenario('loading', 'loading-failed-long-unicode-reason', 'Failed with long multiline Unicode reason', 'loading', (context) =>
    renderLoading(failedReason(`Load failed\n${'terrain detail '.repeat(20)}✨ مرحبا بالعالم`), context.time, context),
  ),
  scenario('save-indicator', 'save-idle', 'Idle save indicator', 'save-indicator', (context) => {
    const view = createSaveIndicator(context.factory, context.host)
    const model = saveStatusMessage(IDLE_SAVE_STATUS, context.time)
    view.render(model)
    return { root: view.root, setTime: noTimeUpdate, dispose: noDispose, viewModel: () => model }
  }),
  scenario('save-indicator', 'save-saving-elapsed', 'Saving remains visible as time advances', 'save-indicator', (context) =>
    savedStateAt('saving', context.time, context),
  ),
  scenario('save-indicator', 'save-saved-expiry', 'Saved receipt expires at three seconds', 'save-indicator', (context) =>
    savedStateAt('saved', 0, context),
  ),
  scenario('save-indicator', 'save-failed-elapsed', 'Failed save remains visible', 'save-indicator', (context) =>
    savedStateAt('failed', context.time, context),
  ),
  scenario('captions', 'captions-zero-rows', 'No visible captions', 'captions', (context) =>
    renderCaptions([], context),
  ),
  scenario('captions', 'captions-multiple-pan', 'Multiple captions with left and right pan', 'captions', (context) =>
    renderCaptions([
      captionEvent('Footsteps left', context.time, -1, 'audible'),
      captionEvent('Door opens', context.time, undefined, 'audible'),
      captionEvent('Jump right', context.time, 1, 'audible'),
    ], context),
  ),
  scenario('captions', 'captions-unavailable', 'Unavailable caption source', 'captions', (context) =>
    renderCaptions([captionEvent('Backend unavailable', context.time, undefined, 'unavailable')], context),
  ),
  scenario('captions', 'captions-expiry-boundary', 'Caption just before its expiry boundary', 'captions', (context) =>
    renderCaptions([captionEvent('Expiring caption', 0, undefined, 'audible')], context),
  ),
  scenario('captions', 'captions-string-boundaries', 'Empty, long, multiline, emoji, and RTL caption text', 'captions', (context) =>
    renderCaptions(captionBoundaryEvents.map((event) => ({ ...event, atSecs: MonotonicTimeSecs(context.time) })), context),
  ),
  scenario('captions', 'captions-boundary-decode-failure', 'Out-of-range pan and negative time are rejected', 'captions', mountCaptionDecodeFailure),
  scenario('captions', 'captions-density-six', 'Six captions with five visible slots', 'captions', (context) =>
    renderCaptions(Array.from({ length: MAX_VISIBLE_CAPTIONS + 1 }, (_value, index) =>
      captionEvent(`Caption ${String(index + 1)}`, context.time, undefined, 'audible'),
    ), context),
  ),
  scenario('captions', 'captions-density-fifty', 'Fifty captions with five visible slots', 'captions', (context) =>
    renderCaptions(Array.from({ length: 50 }, (_value, index) =>
      captionEvent(`Caption ${String(index + 1)}`, context.time, undefined, 'audible'),
    ), context),
  ),
  scenario('crosshair', 'crosshair-idle', 'Idle crosshair', 'crosshair', (context) =>
    renderCrosshair(() => IDLE_CROSSHAIR_STATUS, context),
  ),
  scenario('crosshair', 'crosshair-hit-window', 'Hit marker through the 120 millisecond boundary', 'crosshair', (context) =>
    renderCrosshair(() => ({ ...IDLE_CROSSHAIR_STATUS, lastHitAtSecs: 0 }), context),
  ),
  scenario('crosshair', 'crosshair-progress-range', 'Block breaking at zero and full progress', 'crosshair', (context) =>
    renderCrosshair((seconds) => ({
      ...IDLE_CROSSHAIR_STATUS,
      breakProgress: seconds - context.time < 1 ? 0 : 1,
    }), context),
  ),
  scenario('crosshair', 'crosshair-progress-normalization', 'Out-of-range and non-finite progress normalization', 'crosshair', (context) =>
    renderCrosshair((seconds) => {
      const index = Math.min(PROGRESS_CASES.length - 1, Math.max(0, Math.floor(seconds - context.time)))
      return { ...IDLE_CROSSHAIR_STATUS, breakProgress: PROGRESS_CASES[index] }
    }, context),
  ),
  scenario('hud', 'debug-hud-all-values', 'Debug HUD with all available values', 'debug-overlay', (context) =>
    mountDebugOverlay(allDebugValues, context),
  ),
  scenario('hud', 'debug-hud-unavailable-values', 'Debug HUD with unavailable values', 'debug-overlay', (context) =>
    mountDebugOverlay(emptyDebugModel, context),
  ),
  scenario('hud', 'debug-hud-finite-extremes', 'Debug HUD finite numeric extremes', 'debug-overlay', (context) =>
    mountDebugOverlay(extremeDebugValues, context),
  ),
  scenario('hud', 'debug-hud-decode-failure', 'NaN debug FPS is rejected', 'debug-overlay', mountDebugDecodeFailure),
  scenario('hud', 'achievement-toast-unlocked', 'Just unlocked achievement toast', 'achievement-toast', (context) =>
    mountToast(makeToast('Stone Age'), context),
  ),
  scenario('hud', 'achievement-toast-sequence', 'Two unlocks and virtual-time dismissal', 'achievement-toast', toastSequence),
  scenario('hud', 'achievement-toast-long-title', 'Long Unicode achievement title', 'achievement-toast', (context) =>
    mountToast(makeToast(`Achievement title\n${'long title '.repeat(18)}✨ مرحبا بالعالم`), context),
  ),
  scenario('hud', 'achievement-toast-decode-missing-icon', 'Missing icon is rejected by the toast schema', 'achievement-toast', mountToastDecodeFailure),
]

