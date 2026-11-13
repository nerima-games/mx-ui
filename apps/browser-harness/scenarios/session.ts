import {
  FieldOfViewDegrees,
  InputAction,
  KeyCode,
  MouseSensitivity,
  RenderDistanceChunks,
  VolumeLevel,
  type KeyCode as KeyCodeType,
} from '@nerima-games/mc-kernel/domain/settings'
import { SaveSliceIdSchema, SaveVersionSchema, SimulationTickSchema, WorldIdSchema } from '@nerima-games/mc-kernel'
import { DEFAULT_SETTINGS } from '@nerima-games/mc-sim'
import { Result, Schema } from 'effect'
import { createChatView } from '../../../src/application/chat-view'
import { createMainMenuView } from '../../../src/application/main-menu-view'
import { createOnboardingView } from '../../../src/application/onboarding-view'
import { createPauseMenuView } from '../../../src/application/pause-menu-view'
import { createSettingsView } from '../../../src/application/settings-view'
import { createSessionOverlays } from '../../../src/application/session-overlays'
import type { DomElement } from '../../../src/application/dom-surface'
import { CHAT_RECENT_MESSAGE_TICKS, chatKeyboardAction, type ChatMessage } from '../../../src/domain/chat'
import {
  initialMainMenuState,
  mainMenuViewModel,
  nameWorld,
  openPanel,
  cycleWorldMode,
  type SavedWorld,
  type UnreadableSave,
  type WorldTypeOption,
} from '../../../src/domain/main-menu'
import { ChatTextSchema, WorldNameTextSchema, WorldTypeIdSchema } from '../../../src/domain/ui3-brand-schemas'
import { UiMessageTextSchema } from '../../../src/domain/ui-language'
import { pauseMenuViewModel } from '../../../src/domain/pause-menu-view-model'
import { onboardingViewModel } from '../../../src/domain/onboarding-view-model'
import { settingsViewModel, type SettingsSnapshot } from '../../../src/domain/settings-view-model'
import type { ScenarioContext, ScenarioDefinition, ScenarioMount } from '../scenario-types'

const noTime = (): void => undefined
const decodeChatText = Schema.decodeUnknownSync(ChatTextSchema)
const decodeSaveSliceId = Schema.decodeUnknownSync(SaveSliceIdSchema)
const decodeSaveVersion = Schema.decodeUnknownSync(SaveVersionSchema)
const decodeSimulationTick = Schema.decodeUnknownSync(SimulationTickSchema)
const decodeUiMessageText = Schema.decodeUnknownSync(UiMessageTextSchema)
const decodeWorldId = Schema.decodeUnknownSync(WorldIdSchema)
const decodeWorldNameText = Schema.decodeUnknownSync(WorldNameTextSchema)
const decodeWorldTypeId = Schema.decodeUnknownSync(WorldTypeIdSchema)

const longWorldName = `World ${'界'.repeat(256)}`
const savedWorld = (sessionId: string, name: string): SavedWorld => ({
  name: decodeWorldNameText(name),
  sessionId: decodeWorldId(sessionId),
})

const boundaryWorlds: ReadonlyArray<SavedWorld> = [
  savedWorld('empty-name', ''),
  savedWorld('long-name', longWorldName),
  savedWorld('newline-name', 'First line\nSecond line'),
  savedWorld('emoji-name', '🧭🌌 Survival worlds 🎮'),
  savedWorld('rtl-name', 'العالم العربي'),
  savedWorld('mixed-width-name', '世界 ＡＢＣ ｶﾀｶﾅ'),
]

const manyWorlds: ReadonlyArray<SavedWorld> = Array.from({ length: 200 }, (_, index) => {
  const number = index + 1
  const suffix = String(number).padStart(3, '0')
  return savedWorld(`world-${suffix}`, `Saved world ${suffix}`)
})

const intentWorlds: ReadonlyArray<SavedWorld> = [
  savedWorld('world-one', 'First world'),
]

const intentWorldTypes: ReadonlyArray<WorldTypeOption> = [
  { value: decodeWorldTypeId('standard'), label: { en: decodeUiMessageText('Standard'), ja: decodeUiMessageText('標準') } },
  { value: decodeWorldTypeId('amplified'), label: { en: decodeUiMessageText('Amplified'), ja: decodeUiMessageText('増幅') } },
]

const intentUnreadableSaves: ReadonlyArray<UnreadableSave> = [
  {
    _tag: 'SaveDecodeError',
    key: decodeWorldId('broken-save'),
    format: decodeSaveSliceId('mc-save'),
    version: decodeSaveVersion(4),
    reason: decodeUiMessageText('unsupported header'),
    record: { _tag: 'Save', key: decodeWorldId('broken-save') },
    repair: { lastHealthyRevisionAvailable: false, discardableChunkKeys: [] },
  },
]

const mountMainMenu = (
  context: ScenarioContext,
  state: typeof initialMainMenuState,
  savedWorlds: ReadonlyArray<SavedWorld> = [],
  worldTypes: ReadonlyArray<WorldTypeOption> = [],
  unreadableSaves: ReadonlyArray<UnreadableSave> = [],
): ScenarioMount => {
  let model = mainMenuViewModel(state, savedWorlds, worldTypes, unreadableSaves)
  const view = createMainMenuView(context.factory, context.host, {
    onCreateWorld: (request) => context.emitIntent({ _tag: 'CreateWorld', ...request }),
    onLoadWorld: (world) => context.emitIntent({ _tag: 'LoadWorld', ...world }),
    onDeleteWorld: (world) => context.emitIntent({ _tag: 'DeleteWorld', ...world }),
    onDeleteUnreadableSave: (save) => context.emitIntent({ ...save, _tag: 'DeleteUnreadableSave' }),
    onExportWorld: (world) => context.emitIntent({ _tag: 'ExportWorld', ...world }),
    onOpenMultiplayer: () => context.emitIntent({ _tag: 'OpenMultiplayer' }),
    onOpenSettings: () => context.emitIntent({ _tag: 'OpenSettings' }),
    onExit: () => context.emitIntent({ _tag: 'Exit' }),
    onStateChange: (nextState) => {
      model = mainMenuViewModel(nextState, savedWorlds, worldTypes, unreadableSaves)
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

const editableKeyboardTarget = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null

const mountChat = (context: ScenarioContext): ScenarioMount => {
  const history: ReadonlyArray<ChatMessage> = [
    { text: decodeChatText('Welcome to chat'), tick: decodeSimulationTick(CHAT_RECENT_MESSAGE_TICKS - 1) },
  ]
  const currentTick = CHAT_RECENT_MESSAGE_TICKS
  let isOpen = false
  const view = createChatView(context.factory, context.host, {
    onFailure: (failure) => context.emitIntent({ _tag: 'ChatFailure', failure }),
    onSubmission: (submission) => context.emitIntent({ _tag: 'ChatSubmission', ...submission }),
  })
  const render = (): void => {
    const result = view.render(history, currentTick, isOpen)
    if (Result.isFailure(result)) {
      context.emitIntent({ _tag: 'ChatFailure', failure: result.failure })
    }
  }
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (Reflect.get(context.host.style, 'visibility') !== 'visible') {
      return
    }
    const result = chatKeyboardAction({
      code: event.code,
      isOpen,
      isEditableTarget: editableKeyboardTarget(event.target),
    })
    if (Result.isFailure(result)) {
      context.emitIntent({ _tag: 'ChatFailure', failure: result.failure })
      return
    }
    const action = result.success?.['_tag']
    if (action === 'OpenChat') {
      event.preventDefault()
      isOpen = true
      render()
    } else if (action === 'CloseChat') {
      event.preventDefault()
      isOpen = false
      render()
    }
  }
  document.addEventListener('keydown', handleKeyDown)
  render()
  return {
    root: view.root,
    setTime: noTime,
    dispose: () => document.removeEventListener('keydown', handleKeyDown),
    viewModel: () => ({ currentTick, history, isOpen }),
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
const settingsHostSnapshot: SettingsSnapshot = {
  ...DEFAULT_SETTINGS,
  difficulty: 'hard',
  fovDegrees: FieldOfViewDegrees(92),
  graphicsPreset: 'high',
  graphicsQuality: 'high',
  keyBindings: {
    ...DEFAULT_SETTINGS.keyBindings,
    [InputAction('moveForward')]: KeyCode('KeyW'),
  },
  masterVolume: VolumeLevel(0.8),
  mouseSensitivity: MouseSensitivity(1),
  reducedMotion: 'reduced',
  renderDistance: RenderDistanceChunks(14),
  sfxVolume: VolumeLevel(1),
  uiScale: 1.25,
}

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

const mountSettingsHostUpdates = (context: ScenarioContext): ScenarioMount => {
  const mountPoint = document.createElement('div')
  mountPoint.setAttribute('data-settings-host-mount', '')
  context.host.appendChild(mountPoint)
  let currentSettings = settingsHostSnapshot
  let currentLanguage: 'en' | 'ja' = 'en'
  const overlays = createSessionOverlays(document, mountPoint, {
    callbacks: {
      onBindingActivate: (action) => context.emitIntent({ _tag: 'SettingsBindingActivated', action }),
      onSettingsChange: (snapshot) => {
        currentSettings = snapshot
        context.emitIntent({ _tag: 'SettingsChanged', snapshot })
        const readback = overlays.updateSettingsSnapshot(snapshot, currentLanguage)
        if (Result.isSuccess(readback)) {
          currentSettings = readback.success
          context.emitIntent({ _tag: 'SettingsReadback', snapshot: readback.success })
        } else {
          context.emitIntent({ _tag: 'SettingsReadbackFailure', failure: readback.failure })
        }
      },
    },
    initialLanguage: currentLanguage,
    initialSettingsSnapshot: currentSettings,
    onLanguageChange: (language) => {
      currentLanguage = language
      return Result.succeed(language)
    },
  })
  const handleSettingsHostUpdate = (event: Event): void => {
    const update = overlays.updateSettingsSnapshot(
      (event as CustomEvent<unknown>).detail,
      currentLanguage,
    )
    if (Result.isSuccess(update)) {
      currentSettings = update.success
      context.emitIntent({ _tag: 'SettingsReadback', snapshot: update.success })
    } else {
      context.emitIntent({ _tag: 'SettingsReadbackFailure', failure: update.failure })
    }
  }
  mountPoint.addEventListener('settings-host-update', handleSettingsHostUpdate)
  overlays.openSettings()
  return {
    root: mountPoint,
    setTime: noTime,
    dispose: () => {
      mountPoint.removeEventListener('settings-host-update', handleSettingsHostUpdate)
      overlays.destroy()
      mountPoint.remove()
    },
    viewModel: () => ({ language: currentLanguage, settings: currentSettings }),
  }
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
  const state = nameWorld(openPanel(initialMainMenuState, 'new-world'), decodeWorldNameText(name))
  return creative ? cycleWorldMode(state) : state
}

export const SESSION_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  {
    screen: 'main-menu',
    id: 'root-panel',
    title: 'Root menu',
    surface: 'Main menu',
    isDefault: false,
    mount: (context) => mountMainMenu(context, initialMainMenuState, [], intentWorldTypes),
  },
  {
    screen: 'main-menu',
    id: 'host-intents',
    title: 'World management and host intents',
    surface: 'Main menu',
    isDefault: false,
    mount: (context) =>
      mountMainMenu(
        context,
        initialMainMenuState,
        intentWorlds,
        intentWorldTypes,
        intentUnreadableSaves,
      ),
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
        savedWorld('world-one', 'First world'),
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
    id: 'host-updates',
    title: 'Settings changes with host readback',
    surface: 'Settings',
    isDefault: false,
    mount: mountSettingsHostUpdates,
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
  {
    screen: 'chat',
    id: 'keyboard-intents',
    title: 'Chat keyboard and submission intents',
    surface: 'Chat',
    isDefault: true,
    mount: mountChat,
  },
]
