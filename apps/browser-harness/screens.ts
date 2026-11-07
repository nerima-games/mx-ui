import { MonotonicTimeSecs } from '@nerima-games/mc-kernel'
import { AudioCaptionText, AudioPan, SoundCueId } from '@nerima-games/mc-audio'
import { EntityHealthPoints } from '@nerima-games/mc-sim'
import { captionLines, type CaptionEvent } from '../../src/domain/caption'
import { crosshairViewModel, IDLE_CROSSHAIR_STATUS } from '../../src/domain/crosshair'
import { HOTBAR_SLOT_COUNT, hudViewModel, spawnSnapshot } from '../../src/domain/hud-view-model'
import { emptyInventorySnapshot, inventoryViewModel } from '../../src/domain/inventory-view-model'
import { initialMainMenuState, mainMenuViewModel, openPanel } from '../../src/domain/main-menu'
import { saveStatus, saveStatusMessage } from '../../src/domain/save-status'
import { createCaptionView } from '../../src/application/caption-view'
import { createCrosshairView } from '../../src/application/crosshair-view'
import { createHudView } from '../../src/application/hud-view'
import { createInventoryView } from '../../src/application/inventory-view'
import { createLoadingView } from '../../src/application/loading-view'
import { createMainMenuView } from '../../src/application/main-menu-view'
import { createSaveIndicator } from '../../src/application/save-indicator'
import type { ScenarioContext, ScenarioDefinition, ScenarioMount } from './scenario-types'

const captionTime = (seconds: number): CaptionEvent['atSecs'] => MonotonicTimeSecs(seconds)

export const SCREEN_NAMES = [
  'main-menu',
  'hud',
  'inventory',
  'captions',
  'save-indicator',
  'loading',
  'crosshair',
] as const

export type ScreenName = (typeof SCREEN_NAMES)[number]

const SCREEN_LABELS: Readonly<Record<ScreenName, string>> = {
  'main-menu': 'Main menu',
  hud: 'HUD',
  inventory: 'Inventory',
  captions: 'Captions',
  'save-indicator': 'Save indicator',
  loading: 'Loading',
  crosshair: 'Crosshair',
}

const mountScreen = (name: ScreenName, context: ScenarioContext): ScenarioMount => {
  const { factory, host, environment, breakProgress } = context
  const noTime = (): void => undefined

  switch (name) {
    case 'main-menu': {
      const menu = createMainMenuView(factory, host)
      let model = mainMenuViewModel(openPanel(initialMainMenuState, 'new-world'))
      menu.render(model)
      model = mainMenuViewModel(openPanel(initialMainMenuState, 'load-world'))
      menu.render(model)
      model = mainMenuViewModel(initialMainMenuState)
      menu.render(model)
      return { root: menu.root, setTime: noTime, dispose: noTime, viewModel: () => model }
    }
    case 'hud': {
      const hud = createHudView(factory, host, environment.motion)
      const hotbarSlots = Array.from({ length: HOTBAR_SLOT_COUNT }, () => undefined)
      let model = hudViewModel({ ...spawnSnapshot, healthPoints: EntityHealthPoints(0) }, hotbarSlots, 0)
      hud.render(model)
      model = hudViewModel(spawnSnapshot, hotbarSlots, 0)
      hud.render(model)
      hud.setKeyboardFocus(4)
      return { root: hud.root, setTime: noTime, dispose: noTime, viewModel: () => model }
    }
    case 'inventory': {
      const inventory = createInventoryView(factory, host)
      const model = inventoryViewModel(emptyInventorySnapshot)
      inventory.render(model)
      return { root: inventory.root, setTime: noTime, dispose: noTime, viewModel: () => model }
    }
    case 'captions': {
      const captions = createCaptionView(factory, host, environment.motion)
      const events: ReadonlyArray<CaptionEvent> = [
        {
          atSecs: captionTime(0),
          cueId: SoundCueId('blockBreak'),
          pan: AudioPan(-0.5),
          reason: 'audible',
          text: AudioCaptionText('Creeper hisses'),
        },
      ]
      let model = captionLines(events, captionTime(context.time))
      const setTime = (seconds: number): void => {
        model = captionLines(events, captionTime(seconds))
        captions.render(model)
      }
      setTime(context.time)
      return { root: captions.root, setTime, dispose: noTime, viewModel: () => model }
    }
    case 'save-indicator': {
      const save = createSaveIndicator(factory, host)
      const status = saveStatus('failed', 0)
      let model = saveStatusMessage(status, context.time)
      const setTime = (seconds: number): void => {
        model = saveStatusMessage(status, seconds)
        save.render(model)
      }
      setTime(context.time)
      return { root: save.root, setTime, dispose: noTime, viewModel: () => model }
    }
    case 'loading': {
      const loading = createLoadingView(factory, host)
      let model: Parameters<typeof loading.render>[0] = { kind: 'failed', reason: 'chunk stream ended' }
      loading.render(model)
      model = { kind: 'preparing', held: true }
      loading.render(model)
      return { root: loading.root, setTime: noTime, dispose: noTime, viewModel: () => model }
    }
    case 'crosshair': {
      const crosshair = createCrosshairView(factory, host, environment.motion)
      let model = crosshairViewModel(
        { ...IDLE_CROSSHAIR_STATUS, lastHitAtSecs: 0, breakProgress },
        context.time,
      )
      const setTime = (seconds: number): void => {
        model = crosshairViewModel(
          { ...IDLE_CROSSHAIR_STATUS, lastHitAtSecs: 0, breakProgress },
          seconds,
        )
        crosshair.render(model)
      }
      setTime(context.time)
      return { root: crosshair.root, setTime, dispose: noTime, viewModel: () => model }
    }
    default:
      throw new Error(`browser-harness: unknown screen "${String(name)}"`)
  }
}

export const DEFAULT_SCREEN_SCENARIOS: ReadonlyArray<ScenarioDefinition> = SCREEN_NAMES.map(
  (screen) => ({
    screen,
    id: 'default',
    title: 'Default',
    surface: SCREEN_LABELS[screen],
    isDefault: true,
    mount: (context) => mountScreen(screen, context),
  }),
)
