import { InputAction, KeyCode, type KeyCode as KeyCodeType } from '@nerima-games/mc-kernel/domain/settings'
import { DEFAULT_SETTINGS } from '@nerima-games/mc-sim'
import { Result } from 'effect'
import { createMainMenuView } from '../../../src/application/main-menu-view'
import { createOnboardingView } from '../../../src/application/onboarding-view'
import { createPauseMenuView } from '../../../src/application/pause-menu-view'
import { createSettingsView } from '../../../src/application/settings-view'
import { createSessionOverlays } from '../../../src/application/session-overlays'
import type { DomElement } from '../../../src/application/dom-surface'
import {
  initialMainMenuState,
  mainMenuViewModel,
  nameWorld,
  openPanel,
  cycleWorldMode,
  type SavedWorld,
} from '../../../src/domain/main-menu'
import { pauseMenuViewModel } from '../../../src/domain/pause-menu-view-model'
import { onboardingViewModel } from '../../../src/domain/onboarding-view-model'
import { settingsViewModel } from '../../../src/domain/settings-view-model'
import type { ScenarioContext, ScenarioDefinition, ScenarioMount } from '../scenario-types'

const noTime = (): void => undefined

const longWorldName = `World ${'界'.repeat(256)}`

const boundaryWorlds: ReadonlyArray<SavedWorld> = [
  { sessionId: 'empty-name', name: '' },
  { sessionId: 'long-name', name: longWorldName },
  { sessionId: 'newline-name', name: 'First line\nSecond line' },
  { sessionId: 'emoji-name', name: '🧭🌌 Survival worlds 🎮' },
  { sessionId: 'rtl-name', name: 'العالم العربي' },
  { sessionId: 'mixed-width-name', name: '世界 ＡＢＣ ｶﾀｶﾅ' },
]

const manyWorlds: ReadonlyArray<SavedWorld> = Array.from({ length: 200 }, (_, index) => {
  const number = index + 1
  const suffix = String(number).padStart(3, '0')
  return { sessionId: `world-${suffix}`, name: `Saved world ${suffix}` }
})

const mountMainMenu = (
  context: ScenarioContext,
  state: typeof initialMainMenuState,
  savedWorlds: ReadonlyArray<SavedWorld> = [],
): ScenarioMount => {
  let model = mainMenuViewModel(state, savedWorlds)
  const view = createMainMenuView(context.factory, context.host, {
    onCreateWorld: noTime,
    onLoadWorld: noTime,
    onOpenSettings: noTime,
    onStateChange: (nextState) => {
      model = mainMenuViewModel(nextState, savedWorlds)
    },
  })
  view.render(model)
  return {
    root: view.root,
    setTime: noTime,
    dispose: view.destroy,
    viewModel: () => model,
  }
}

const EMPTY_BINDINGS: Readonly<Record<string, KeyCodeType>> = {}
const validSettings = {
  ...DEFAULT_SETTINGS,
  fovDegrees: 30,
  masterVolume: 0,
  mouseSensitivity: 0.1,
  sfxVolume: 1,
  uiScale: 1.5,
}
const invalidSettings = { ...DEFAULT_SETTINGS, fovDegrees: Number.NaN }

const mountSettings = (context: ScenarioContext, input: unknown): ScenarioMount => {
  const result = settingsViewModel(input, EMPTY_BINDINGS, [])
  if (Result.isFailure(result)) {
    const root: DomElement = context.factory.createElement('section')
    root.setAttribute('data-harness-decode-failure', 'settings')
    root.setAttribute('role', 'alert')
    root.textContent = 'Settings snapshot decode failure'
    context.host.appendChild(root)
    return {
      root,
      setTime: noTime,
      dispose: noTime,
      viewModel: () => ({ kind: 'decode-failure', reason: 'Settings snapshot decode failure' }),
    }
  }

  const view = createSettingsView(context.factory, context.host)
  view.render(result.success)
  return { root: view.root, setTime: noTime, dispose: noTime, viewModel: () => result.success }
}

const quickControls = [
  { action: InputAction('Move'), keys: KeyCode('W') },
  { action: InputAction('Jump'), keys: KeyCode('Space') },
  { action: InputAction('Open inventory'), keys: KeyCode('E') },
]

const mountOnboarding = (context: ScenarioContext, open: boolean): ScenarioMount => {
  const view = createOnboardingView(context.factory, context.host, { onIntent: context.emitIntent })
  const model = onboardingViewModel({
    firstRun: open,
    quickControlsDismissed: !open,
    quickControls,
  })
  view.render(model)
  return {
    root: view.root,
    setTime: noTime,
    dispose: () => {
      view.root.textContent = ''
    },
    viewModel: () => model,
  }
}

const mountPause = (context: ScenarioContext, stack: ReadonlyArray<'pause' | 'settings'>): ScenarioMount => {
  let model = pauseMenuViewModel(stack)
  const view = createPauseMenuView(context.factory, context.host, {
    onHostIntent: context.emitIntent,
    onModalStackChange: (nextStack) => {
      model = pauseMenuViewModel(nextStack)
    },
  })
  view.render(model)
  return { root: view.root, setTime: noTime, dispose: view.destroy, viewModel: () => model }
}

const mountSessionOverlays = (
  context: ScenarioContext,
  settingsOpen: boolean,
  debugHudOpen: boolean,
): ScenarioMount => {
  const mountPoint = document.createElement('div')
  context.host.appendChild(mountPoint)
  const overlays = createSessionOverlays(document, mountPoint)
  if (settingsOpen) {
    overlays.openSettings()
  }
  if (debugHudOpen) {
    overlays.toggleDebug()
  }
  return {
    root: overlays.root,
    setTime: noTime,
    dispose: () => {
      overlays.destroy()
      mountPoint.remove()
    },
    viewModel: () => ({ settingsOpen, debugHudOpen }),
  }
}

const newWorldState = (name: string, creative: boolean) => {
  const state = nameWorld(openPanel(initialMainMenuState, 'new-world'), name)
  return creative ? cycleWorldMode(state) : state
}

export const SESSION_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  {
    screen: 'main-menu',
    id: 'root-panel',
    title: 'Root menu',
    surface: 'Main menu',
    isDefault: false,
    mount: (context) => mountMainMenu(context, initialMainMenuState),
  },
  {
    screen: 'main-menu',
    id: 'new-world-survival',
    title: 'New world, survival',
    surface: 'Main menu',
    isDefault: false,
    mount: (context) => mountMainMenu(context, newWorldState('', false)),
  },
  {
    screen: 'main-menu',
    id: 'new-world-creative',
    title: 'New world, creative',
    surface: 'Main menu',
    isDefault: false,
    mount: (context) => mountMainMenu(context, newWorldState('Moonlit biome', true)),
  },
  {
    screen: 'main-menu',
    id: 'new-world-long-name',
    title: 'New world, long name',
    surface: 'Main menu',
    isDefault: false,
    mount: (context) => mountMainMenu(context, newWorldState(longWorldName, false)),
  },
  {
    screen: 'main-menu',
    id: 'load-world-empty',
    title: 'Load world, 0 saved worlds',
    surface: 'Main menu',
    isDefault: false,
    mount: (context) => mountMainMenu(context, openPanel(initialMainMenuState, 'load-world')),
  },
  {
    screen: 'main-menu',
    id: 'load-world-one',
    title: 'Load world, 1 saved world',
    surface: 'Main menu',
    isDefault: false,
    mount: (context) =>
      mountMainMenu(context, openPanel(initialMainMenuState, 'load-world'), [
        { sessionId: 'world-one', name: 'First world' },
      ]),
  },
  {
    screen: 'main-menu',
    id: 'load-world-200',
    title: 'Load world, 200 saved worlds',
    surface: 'Main menu',
    isDefault: false,
    mount: (context) => mountMainMenu(context, openPanel(initialMainMenuState, 'load-world'), manyWorlds),
  },
  {
    screen: 'main-menu',
    id: 'load-world-name-boundaries',
    title: 'Load world, boundary names',
    surface: 'Main menu',
    isDefault: false,
    mount: (context) =>
      mountMainMenu(context, openPanel(initialMainMenuState, 'load-world'), boundaryWorlds),
  },
  {
    screen: 'pause',
    id: 'paused',
    title: 'Pause menu',
    surface: 'Pause',
    isDefault: true,
    mount: (context) => mountPause(context, ['pause']),
  },
  {
    screen: 'settings',
    id: 'valid-boundaries',
    title: 'Valid settings snapshot at numeric boundaries',
    surface: 'Settings',
    isDefault: true,
    mount: (context) => mountSettings(context, validSettings),
  },
  {
    screen: 'settings',
    id: 'invalid-nan-fov',
    title: 'Invalid settings snapshot, non-finite FOV',
    surface: 'Settings',
    isDefault: false,
    mount: (context) => mountSettings(context, invalidSettings),
  },
  {
    screen: 'settings',
    id: 'invalid-high-fov',
    title: 'Invalid settings snapshot, FOV above maximum',
    surface: 'Settings',
    isDefault: false,
    mount: (context) => mountSettings(context, { ...DEFAULT_SETTINGS, fovDegrees: 111 }),
  },
  {
    screen: 'onboarding',
    id: 'open',
    title: 'Quick controls open',
    surface: 'Onboarding',
    isDefault: true,
    mount: (context) => mountOnboarding(context, true),
  },
  {
    screen: 'onboarding',
    id: 'closed',
    title: 'Quick controls closed',
    surface: 'Onboarding',
    isDefault: false,
    mount: (context) => mountOnboarding(context, false),
  },
  {
    screen: 'session-overlays',
    id: 'pause-only',
    title: 'Pause only',
    surface: 'Session overlays',
    isDefault: true,
    mount: (context) => mountPause(context, ['pause']),
  },
  {
    screen: 'session-overlays',
    id: 'pause-settings-stack',
    title: 'Pause with settings on top',
    surface: 'Session overlays',
    isDefault: false,
    mount: (context) => mountPause(context, ['pause', 'settings']),
  },
  {
    screen: 'session-overlays',
    id: 'factory-none-open',
    title: 'Factory overlays closed',
    surface: 'Session overlays',
    isDefault: false,
    mount: (context) => mountSessionOverlays(context, false, false),
  },
  {
    screen: 'session-overlays',
    id: 'factory-settings-open',
    title: 'Factory settings open',
    surface: 'Session overlays',
    isDefault: false,
    mount: (context) => mountSessionOverlays(context, true, false),
  },
  {
    screen: 'session-overlays',
    id: 'factory-debug-hud-open',
    title: 'Factory debug HUD open',
    surface: 'Session overlays',
    isDefault: false,
    mount: (context) => mountSessionOverlays(context, false, true),
  },
  {
    screen: 'session-overlays',
    id: 'factory-settings-debug-open',
    title: 'Factory settings and debug HUD open',
    surface: 'Session overlays',
    isDefault: false,
    mount: (context) => mountSessionOverlays(context, true, true),
  },
]
